import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FlyApi } from '../src/lib/fly-api.class';
import type { Fly } from '../src/lib/fly.class';
import {
  AppIpAddressSchema,
  AppIpAddressesApiResponseSchema
} from '../src/lib/schemas/app-ip-addresses.schema';
import {
  CertificateApiResponseSchema,
  HostnameCheckApiResponseSchema
} from '../src/lib/schemas/certificate.schema';

import {
  cleanupTestApps,
  createFly,
  createFlyApi,
  createTestApp,
  ensureEmptyTestAppsDir,
  testCertHostname
} from './setup';

/**
 * The GraphQL client against the real Fly api.
 *
 * The unit tests mock `fetch`, which proves the client's own logic and nothing
 * about whether Fly agrees with it. That gap is not theoretical: this client
 * was first written against a field called `configured`, and the api calls it
 * `isConfigured` — every call would have thrown on parse, and every mocked
 * test would still have passed.
 *
 * Everything here is read-only unless `FLY_TEST_CERT_HOSTNAME` is set, because
 * requesting a certificate writes state into a real organisation.
 */

let api: FlyApi;
let fly: Fly;
let app: string;

beforeAll(async () => {
  api = createFlyApi();
  fly = createFly('config-token');
  ensureEmptyTestAppsDir();

  // An app is enough — certificates attach to the app, not to a machine, so
  // there is nothing to deploy
  const created = await createTestApp(fly, { build: 'image', deploy: false });
  app = created.appName;
}, 120_000);

afterAll(async () => {
  await cleanupTestApps(fly);
}, 120_000);

describe('FlyApi certs', () => {
  it('lists certificates for an app that has none', async () => {
    await expect(api.certs.list(app)).resolves.toEqual([]);
  });

  it('answers null for a hostname with no certificate', async () => {
    await expect(
      api.certs.get(app, 'never-added.example.com')
    ).resolves.toBeNull();
  });

  it('rejects an unknown app rather than answering emptily', async () => {
    // A typo in an app name must not read as "this app has no certificates"
    await expect(
      api.certs.list(`does-not-exist-${Date.now()}`)
    ).rejects.toThrow();
  });

  it('refuses a bad token', async () => {
    const wrong = new FlyApi({ token: 'fly_not_a_real_token' });

    await expect(wrong.certs.list(app)).rejects.toThrow();
  });
});

/**
 * The add/remove cycle, which the CLI suite has open as a `todo` because it
 * could not answer "does Let's Encrypt provide test certs?".
 *
 * It does not need to: a certificate for a hostname whose DNS does not point
 * at the app never validates, so nothing is ever issued and no issuance limit
 * is touched. The pending certificate is exactly what a customer sees between
 * adding a domain and fixing their DNS — the state this whole feature is about.
 */
describe.skipIf(!testCertHostname())('FlyApi certs add/remove', () => {
  const hostname = testCertHostname() as string;

  beforeAll(async () => {
    // Start clean: if a previous run failed mid-cycle, the hostname may still be attached to the app
    await api.certs.remove(app, hostname).catch(() => undefined);
  });

  afterAll(async () => {
    // Leave nothing behind even if an assertion failed mid-cycle
    await api.certs.remove(app, hostname).catch(() => undefined);
  });

  it('requests a certificate and reports it as pending', async () => {
    const { certificate, check } = await api.certs.add(app, hostname);

    expect(() => CertificateApiResponseSchema.parse(certificate)).not.toThrow();
    expect(certificate.hostname).toBe(hostname);
    // Not configured: DNS does not point here, which is the point
    expect(certificate.isConfigured).toBe(false);

    if (check) {
      expect(() => HostnameCheckApiResponseSchema.parse(check)).not.toThrow();
    }
  });

  it('tells the customer which records to create', async () => {
    const { certificate } = await api.certs.add(app, hostname);
    const instructions = FlyApi.dnsInstructions(certificate);

    // Fly gives either the validation record or prose; a panel with neither
    // would leave someone with nothing to act on
    expect(instructions.hostname ?? instructions.instructions).toBeTruthy();
    expect(typeof instructions.isApex).toBe('boolean');
  });

  it('is idempotent — adding twice returns the same certificate', async () => {
    const first = await api.certs.add(app, hostname);
    const second = await api.certs.add(app, hostname);

    expect(second.certificate.id).toBe(first.certificate.id);
  });

  it('resolves dns for the hostname and reports what Fly objects to', async () => {
    await api.certs.add(app, hostname);

    const result = await api.certs.check(app, hostname);

    expect(() => HostnameCheckApiResponseSchema.parse(result)).not.toThrow();
    // DNS does not point here, so Fly has something to say about it — this is
    // the query that was first written against `AppCertificate.check`
    // (a plain boolean in the real schema, not the object this asserts on)
    expect(result?.dnsConfigured).toBe(false);
  });

  it('reads the certificate back and then removes it', async () => {
    await api.certs.add(app, hostname);

    await expect(api.certs.get(app, hostname)).resolves.toMatchObject({
      hostname
    });
    await expect(api.certs.list(app)).resolves.toHaveLength(1);

    await api.certs.remove(app, hostname);

    await expect(api.certs.get(app, hostname)).resolves.toBeNull();
  });
});

/**
 * The machines half, which is a different api on a different host.
 *
 * Read-only: the test app is created without a deployment, so it has no
 * machines to restart. What this proves is the part mocks cannot — that the
 * same token authenticates against `api.machines.dev`, and that Fly's real
 * response parses.
 */
describe('FlyApi machines', () => {
  it('lists machines for an app that has none', async () => {
    await expect(api.machines.list(app)).resolves.toEqual([]);
  });

  it('restarts nothing when there is nothing to restart', async () => {
    await expect(api.machines.restart(app)).resolves.toEqual([]);
  });

  it('rejects an unknown app rather than answering emptily', async () => {
    await expect(
      api.machines.list(`does-not-exist-${Date.now()}`)
    ).rejects.toThrow();
  });

  it('refuses a bad token', async () => {
    const wrong = new FlyApi({ token: 'fly_not_a_real_token' });

    await expect(wrong.machines.list(app)).rejects.toThrow();
  });
});

describe('FlyApi ips', () => {
  it('lists the addresses of an app as typed rows', async () => {
    const addresses = await api.ips.list(app);

    // A fresh, undeployed app may hold none; whatever it holds must parse
    expect(Array.isArray(addresses)).toBe(true);
    for (const address of addresses) {
      expect(AppIpAddressSchema.safeParse(address).success).toBe(true);
    }
  });

  it('rejects an unknown app rather than answering emptily', async () => {
    await expect(
      api.ips.list(`does-not-exist-${Date.now()}`)
    ).rejects.toThrow();
  });
});

/**
 * Does Fly's schema still match what we parse?
 *
 * Introspection rather than a captured payload: a fixture proves the shape of
 * a moment, and cannot notice a field being renamed afterwards.
 */
describe('Fly GraphQL schema drift', () => {
  const fieldsOf = async (typeName: string): Promise<Array<string>> => {
    const response = await fetch('https://api.fly.io/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env['FLY_TEST_API_TOKEN']}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query TypeFields($name: String!) {
          __type(name: $name) { fields { name } }
        }`,
        variables: { name: typeName }
      })
    });

    const body = (await response.json()) as {
      data?: { __type?: { fields: Array<{ name: string }> } };
    };

    return (body.data?.__type?.fields ?? []).map((field) => field.name);
  };

  it('still exposes every certificate field we parse', async () => {
    const actual = await fieldsOf('AppCertificate');
    const parsed = Object.keys(CertificateApiResponseSchema.shape);

    expect(actual.length).toBeGreaterThan(0);
    expect(parsed.filter((field) => !actual.includes(field))).toEqual([]);
  });

  it('still exposes the app address fields we query', async () => {
    const actual = await fieldsOf('App');
    const parsed = Object.keys(AppIpAddressesApiResponseSchema.shape);

    expect(actual.length).toBeGreaterThan(0);
    expect(parsed.filter((field) => !actual.includes(field))).toEqual([]);
  });

  it('still exposes every ip address field we parse', async () => {
    const actual = await fieldsOf('IPAddress');
    const parsed = Object.keys(AppIpAddressSchema.shape);

    expect(actual.length).toBeGreaterThan(0);
    expect(parsed.filter((field) => !actual.includes(field))).toEqual([]);
  });

  it('still exposes every hostname check field we parse', async () => {
    const actual = await fieldsOf('HostnameCheck');
    const parsed = Object.keys(HostnameCheckApiResponseSchema.shape);

    expect(actual.length).toBeGreaterThan(0);
    expect(parsed.filter((field) => !actual.includes(field))).toEqual([]);
  });
});
