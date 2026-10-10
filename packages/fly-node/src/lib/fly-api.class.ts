import {
  type AppIpAddress,
  AppIpAddressesApiResponseSchema
} from './schemas/app-ip-addresses.schema';
import {
  type Certificate,
  CertificateApiResponseSchema,
  CertificateListApiResponseSchema,
  type DnsInstructions,
  type HostnameCheck,
  HostnameCheckApiResponseSchema
} from './schemas/certificate.schema';
import {
  type Machine,
  MachineListApiResponseSchema
} from './schemas/machine.schema';

/** Fly's GraphQL endpoint */
const FLY_API_URL = 'https://api.fly.io/graphql';

/** Fly's Machines REST endpoint, which GraphQL has no equivalent for */
const FLY_MACHINES_URL = 'https://api.machines.dev/v1';

export type FlyApiConfig = {
  /** Fly API token. An org-scoped token can manage certificates for its apps */
  token: string;
  /** Override the endpoint, for tests or a private Fly instance */
  apiUrl?: string;
  /** Override the machines endpoint, for tests or a private Fly instance */
  machinesUrl?: string;
  /** Called with a one-line description of every request; defaults to silence */
  log?: (message: string) => void;
};

/** A GraphQL error as Fly returns it — status 200 with an `errors` array */
type GraphQLError = { message: string; extensions?: { code?: string } };

/**
 * A rejection from Fly, carrying the codes it sent.
 *
 * The codes matter: `NOT_FOUND` for a hostname with no certificate is an
 * answer, while everything else is a fault. Callers should not have to match
 * on message text to tell them apart.
 */
export class FlyApiError extends Error {
  readonly errors: Array<GraphQLError>;

  constructor(message: string, errors: Array<GraphQLError>) {
    super(message);
    this.name = 'FlyApiError';
    this.errors = errors;
  }

  /** Whether every error is Fly saying the thing simply does not exist */
  get isNotFound(): boolean {
    return (
      this.errors.length > 0 &&
      this.errors.every((error) => error.extensions?.code === 'NOT_FOUND')
    );
  }

  /**
   * Whether every error is Fly refusing a hostname that already has a
   * certificate on the app.
   *
   * No `extensions.code` comes with this one — Fly's own dashboard and
   * `flyctl` hit the same message, and both work around it the same way this
   * class does, by re-reading rather than retrying the mutation.
   */
  get isAlreadyExists(): boolean {
    return (
      this.errors.length > 0 &&
      this.errors.every((error) => /already exists/i.test(error.message))
    );
  }
}

/**
 * Fly over its HTTP APIs, with no `flyctl` in sight.
 *
 * The `Fly` class in this package drives the CLI, which is the right tool in
 * CI: it can build and deploy, and a runner has the binary. It cannot run
 * inside an application server — there is no binary in the image, and the
 * interactive paths need a pty.
 *
 * This class exists for the operations an application needs to perform on
 * itself at runtime. It is deliberately a small subset rather than a second
 * implementation of the whole CLI: certificates, because a custom domain has to
 * be requested, checked and shown to a customer while they wait, and machine
 * restarts, because a setting read at boot needs a boot to take effect. And
 * addresses, because an apex domain points A and AAAA records at them.
 *
 * Fly splits those across two APIs and so does this class — certificates over
 * GraphQL, machines over the REST Machines API. One token authenticates both.
 * The split is Fly's; it is not hidden here, because the two have different
 * hosts and different failure shapes.
 *
 * Where this and the CLI can do the same thing the returned shapes agree, so a
 * caller can move between them. Where they differ, the API gives *more*:
 * issuance state and the DNS records to create come back as fields rather than
 * as text a human was meant to read.
 */
export class FlyApi {
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly machinesUrl: string;
  private readonly log: (message: string) => void;

  constructor(config: FlyApiConfig) {
    if (!config.token) {
      throw new Error('[fly-api] A Fly API token is required');
    }

    this.token = config.token;
    this.apiUrl = config.apiUrl ?? FLY_API_URL;
    this.machinesUrl = config.machinesUrl ?? FLY_MACHINES_URL;
    this.log = config.log ?? (() => undefined);
  }

  /**
   * Manage certificates for an app.
   *
   * Every method takes the app name explicitly: this client is used by a
   * process acting on *other* apps — the cms managing a tenant's web app — so
   * there is no ambient "current app" to default to.
   */
  certs = {
    /**
     * Request a certificate for a hostname.
     *
     * Safe to call when one already exists: Fly's own mutation is not
     * idempotent — a hostname it already has a certificate for on this app is
     * a fault, not a no-op, so this re-reads the existing certificate itself
     * rather than surfacing that as an error a caller has to know to expect.
     *
     * Requesting before DNS is in place is normal and expected — the
     * certificate stays pending until the records resolve, and the returned
     * validation fields are what you show the customer meanwhile.
     *
     * @param app - Fly app name the domain should serve from
     * @param hostname - Domain without a scheme, e.g. `tours.example.com`
     * @returns The certificate, plus what Fly resolves for that hostname now
     */
    add: async (
      app: string,
      hostname: string
    ): Promise<{ certificate: Certificate; check: HostnameCheck | null }> => {
      try {
        const data = await this.request<{
          addCertificate: { certificate: unknown; check: unknown };
        }>(
          `mutation AddCertificate($appId: ID!, $hostname: String!) {
            addCertificate(appId: $appId, hostname: $hostname) {
              certificate { ${CERTIFICATE_FIELDS} }
              check { ${HOSTNAME_CHECK_FIELDS} }
            }
          }`,
          { appId: app, hostname }
        );

        return {
          certificate: CertificateApiResponseSchema.parse(
            data.addCertificate.certificate
          ),
          // Live resolution, and it comes back with the mutation for free —
          // the customer has usually just edited DNS and wants to know if it
          // took
          check: data.addCertificate.check
            ? HostnameCheckApiResponseSchema.parse(data.addCertificate.check)
            : null
        };
      } catch (error) {
        if (error instanceof FlyApiError && error.isAlreadyExists) {
          const certificate = await this.certs.get(app, hostname);
          // Fly said a certificate is there; if a read right after cannot
          // find it, something stranger than a race is going on, and the
          // original error says more about it than a fabricated one would
          if (certificate) {
            return { certificate, check: null };
          }
        }
        throw error;
      }
    },

    /**
     * Read one certificate, or `null` when the app has none for that hostname.
     *
     * This is the call behind a "check" button: it re-reads issuance state from
     * Fly rather than trusting anything stored locally.
     *
     * Fly reports an absent certificate as a `NOT_FOUND` *error* rather than a
     * null field, so that case is translated here — asking about a domain
     * nobody has added yet is an ordinary question with an ordinary answer.
     */
    get: async (app: string, hostname: string): Promise<Certificate | null> => {
      let data: { app: { certificate: unknown } | null };

      try {
        data = await this.request<{ app: { certificate: unknown } | null }>(
          `query AppCertificate($appName: String!, $hostname: String!) {
            app(name: $appName) {
              certificate(hostname: $hostname) { ${CERTIFICATE_FIELDS} }
            }
          }`,
          { appName: app, hostname }
        );
      } catch (error) {
        if (error instanceof FlyApiError && error.isNotFound) {
          return null;
        }
        throw error;
      }

      const certificate = data.app?.certificate;

      return certificate
        ? CertificateApiResponseSchema.parse(certificate)
        : null;
    },

    /**
     * What Fly resolves for a hostname right now, and what it objects to.
     *
     * A mutation on Fly's side despite reading rather than writing anything —
     * `AppCertificate.check` is a plain boolean flag, and `HostnameCheck` is
     * only ever returned by `addCertificate` and this, `checkCertificate`.
     * Separate from `get` rather than folded into it: triggering a live dns
     * resolution on every read would cost a caller that only wants issuance
     * state. Pair the two when a person has just edited their records and
     * wants to know whether it took.
     *
     * `errors` is the useful half — it is what Fly's own dashboard prints as
     * "validation issues", already phrased for whoever owns the domain.
     *
     * @returns `null` when the app has no certificate for that hostname
     */
    check: async (
      app: string,
      hostname: string
    ): Promise<HostnameCheck | null> => {
      let data: { checkCertificate: { check: unknown } | null };

      try {
        data = await this.request<{
          checkCertificate: { check: unknown } | null;
        }>(
          `mutation CheckCertificate($appId: ID!, $hostname: String!) {
            checkCertificate(input: { appId: $appId, hostname: $hostname }) {
              check { ${HOSTNAME_CHECK_FIELDS} }
            }
          }`,
          { appId: app, hostname }
        );
      } catch (error) {
        if (error instanceof FlyApiError && error.isNotFound) {
          return null;
        }
        throw error;
      }

      const check = data.checkCertificate?.check;

      return check ? HostnameCheckApiResponseSchema.parse(check) : null;
    },

    /** Every certificate on an app */
    list: async (app: string): Promise<Array<Certificate>> => {
      const data = await this.request<{
        app: { certificates: { nodes: Array<unknown> } } | null;
      }>(
        `query AppCertificates($appName: String!) {
          app(name: $appName) {
            certificates { nodes { ${CERTIFICATE_FIELDS} } }
          }
        }`,
        { appName: app }
      );

      return CertificateListApiResponseSchema.parse(
        data.app?.certificates?.nodes ?? []
      );
    },

    /**
     * Remove a certificate.
     *
     * The hostname keeps resolving until its DNS is changed — this only stops
     * Fly serving TLS for it.
     */
    remove: async (app: string, hostname: string): Promise<void> => {
      await this.request(
        `mutation DeleteCertificate($appId: ID!, $hostname: String!) {
          deleteCertificate(appId: $appId, hostname: $hostname) {
            certificate { hostname }
          }
        }`,
        { appId: app, hostname }
      );
    }
  };

  /** Read an app's addresses */
  ips = {
    /**
     * Every address an app holds, as `fly ips list` reports them.
     *
     * The shared v4 is folded in as a `shared_v4` row, the way the CLI shows
     * it; Fly's API keeps it in a separate field. Private addresses are
     * included too, so pick the types you need before pointing DNS at them.
     *
     * @returns The addresses, empty when the app has none or does not exist
     */
    list: async (app: string): Promise<Array<AppIpAddress>> => {
      let data: { app: unknown };

      try {
        data = await this.request<{ app: unknown }>(
          `query AppIpAddresses($appName: String!) {
            app(name: $appName) {
              sharedIpAddress
              ipAddresses { nodes { address type } }
            }
          }`,
          { appName: app }
        );
      } catch (error) {
        // Fly answers an unknown app with NOT_FOUND rather than a null app
        if (error instanceof FlyApiError && error.isNotFound) {
          return [];
        }
        throw error;
      }

      if (!data.app) {
        return [];
      }

      const { sharedIpAddress, ipAddresses } =
        AppIpAddressesApiResponseSchema.parse(data.app);

      return [
        ...(sharedIpAddress
          ? [{ address: sharedIpAddress, type: 'shared_v4' }]
          : []),
        ...ipAddresses.nodes
      ];
    }
  };

  /**
   * Operate an app's machines.
   *
   * Over Fly's REST Machines API rather than GraphQL, which has no current
   * equivalent — the GraphQL mutations date from the Nomad platform and no
   * longer apply.
   */
  machines = {
    /** Every machine on an app */
    list: async (app: string): Promise<Array<Machine>> => {
      const data = await this.machinesRequest<Array<unknown>>(
        'GET',
        `/apps/${encodeURIComponent(app)}/machines`
      );

      return MachineListApiResponseSchema.parse(data ?? []);
    },

    /**
     * Restart an app's machines.
     *
     * One at a time on purpose: a settings change that only takes effect at
     * boot should not cost the app its availability to apply. Restarting them
     * together would drop every machine at once, while sequentially leaves the
     * others serving. The trade is that a large app takes longer.
     *
     * A machine that fails to restart stops the run rather than being skipped —
     * a half-restarted app is running two configurations at the same time, and
     * silently returning "some of them" invites calling that done.
     *
     * @param app - Fly app name
     * @param machineId - Restart only this machine, instead of all of them
     * @returns Ids of the machines that were restarted, in the order they were
     */
    restart: async (
      app: string,
      machineId?: string
    ): Promise<Array<string>> => {
      const ids = machineId
        ? [machineId]
        : (await this.machines.list(app)).map((machine) => machine.id);

      const restarted: Array<string> = [];

      for (const id of ids) {
        await this.machinesRequest(
          'POST',
          `/apps/${encodeURIComponent(app)}/machines/${encodeURIComponent(id)}/restart`
        );
        restarted.push(id);
      }

      return restarted;
    }
  };

  /**
   * The DNS records a customer must create for a certificate to validate.
   *
   * Pulled out of the certificate rather than fetched, so a caller that
   * already has one does not pay for a second round trip.
   */
  static dnsInstructions(certificate: Certificate): DnsInstructions {
    return {
      hostname: certificate.dnsValidationHostname,
      target: certificate.dnsValidationTarget,
      instructions: certificate.dnsValidationInstructions,
      isApex: certificate.isApex
    };
  }

  /**
   * @private
   * One GraphQL round trip.
   *
   * Fly answers a failed query with HTTP 200 and an `errors` array, so a
   * response is only successful when both are checked — trusting the status
   * alone would turn "permission denied" into a parse error further down.
   */
  private async request<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'query';
    this.log(`[fly-api] ${operation} ${JSON.stringify(variables)}`);

    let response: Response;

    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables })
      });
    } catch (error) {
      // Network failure: worth separating from a rejection by Fly, because the
      // caller can retry this one
      throw new Error(`[fly-api] ${operation} could not reach Fly: ${error}`);
    }

    if (!response.ok) {
      throw new Error(
        `[fly-api] ${operation} failed: ${response.status} ${response.statusText}`
      );
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: Array<GraphQLError>;
    };

    if (body.errors?.length) {
      throw new FlyApiError(
        `[fly-api] ${operation} failed: ${body.errors
          .map((error) => error.message)
          .join('; ')}`,
        body.errors
      );
    }

    if (!body.data) {
      throw new Error(`[fly-api] ${operation} returned no data`);
    }

    return body.data;
  }

  /**
   * @private
   * One call to the Machines REST API.
   *
   * Unlike GraphQL this one reports failure through the status code, and puts
   * its reason in an `error` field. Worth reading rather than reporting the
   * status alone: "machine not found" and "unauthorized" are different problems
   * with different fixes.
   */
  private async machinesRequest<T>(
    method: 'GET' | 'POST',
    path: string
  ): Promise<T | null> {
    this.log(`[fly-api] ${method} ${path}`);

    let response: Response;

    try {
      response = await fetch(`${this.machinesUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      throw new Error(
        `[fly-api] ${method} ${path} could not reach Fly: ${error}`
      );
    }

    // Read the body first: an error body is the useful half of a failure, and
    // it is gone once the response is discarded
    const body = (await response.json().catch(() => null)) as
      (T & { error?: string }) | null;

    if (!response.ok) {
      throw new Error(
        `[fly-api] ${method} ${path} failed: ${response.status} ${body?.error ?? response.statusText}`
      );
    }

    return body;
  }
}

/**
 * Field selection shared by every certificate query.
 *
 * Kept in one place so the schema and the selection cannot drift apart.
 */
const CERTIFICATE_FIELDS = `
  id
  hostname
  isConfigured
  isApex
  isWildcard
  isAcmeDnsConfigured
  isAcmeAlpnConfigured
  isAcmeHttpConfigured
  certificateAuthority
  certificateRequestedAt
  createdAt
  domain
  dnsProvider
  dnsValidationHostname
  dnsValidationTarget
  dnsValidationInstructions
  clientStatus
  rateLimitedUntil
  source
  validationErrors {
    message
    timestamp
  }
  # Fly issues one certificate per key type (RSA and ECDSA), so a hostname
  # with a single expiry date still comes back as two rows
  issued(first: 10) {
    nodes {
      id
      type
      hostname
      expiresAt
    }
  }
`;

/**
 * Live DNS resolution for a hostname.
 *
 * Deliberately absent from `list`: resolving it is a live dns lookup per
 * hostname (see `certs.check`), so selecting it across every certificate on
 * an app would turn one query into a lookup per domain.
 */
const HOSTNAME_CHECK_FIELDS = `
  aRecords
  aaaaRecords
  cnameRecords
  caaRecords
  soa
  dnsProvider
  dnsVerificationRecord
  dnsConfigured
  acmeDnsConfigured
  resolvedAddresses
  isProxied
  errors
`;
