import type { HostnameCheck } from '@cdwr/fly-node/api';
import {
  type CertificateState,
  applyCertificateState,
  flyUnavailableMessage,
  getFlyApi,
  parseHostname,
  toCertificateState
} from '@codeware/app-cms/feature/domains';
import { hasRole } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

/** What the panel may ask for */
const ACTIONS = ['request', 'check', 'remove'] as const;

type Action = (typeof ACTIONS)[number];

type Body = { tenant?: unknown; hostname?: unknown; action?: unknown };

type Result = {
  certificate: CertificateState | null;
  /** Live dns resolution, and whatever Fly objects to about it */
  check: HostnameCheck | null;
};

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * Request, re-read or withdraw the TLS certificate for a workspace domain.
 *
 * Certificates are the one part of a custom domain the platform owns: the
 * customer controls their dns, Fly issues the certificate, and neither can
 * finish without the other. This endpoint is the platform's half, driven from
 * the workspace's domains panel.
 *
 * Restricted to system users, matching who may edit a workspace at all. The
 * Fly token is org-scoped — it can attach a certificate to *any* app in the
 * organisation — so the app name is never taken from the request. It is read
 * from the stored domain row, which means a caller can only ever act on a
 * hostname a system user already wrote down against a specific app.
 *
 * Every answer is recorded on the row, including "there is no certificate".
 * The panel then renders without calling Fly, and the boot read that resolves
 * an app's own url has something to trust when it cannot call anything.
 */
export const tenantDomainCertificateEndpoint: Endpoint = {
  path: '/tenant-domain-certificate',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;

    const tenantId = Number(body.tenant);
    const action = String(body.action) as Action;
    const parsed = parseHostname(String(body.hostname ?? ''));

    if (
      !Number.isInteger(tenantId) ||
      tenantId < 1 ||
      !ACTIONS.includes(action) ||
      !parsed.valid
    ) {
      return fail(StatusCodes.BAD_REQUEST);
    }

    const { hostname } = parsed;

    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
      overrideAccess: false,
      user: req.user,
      disableErrors: true,
      req
    });

    const domains = tenant?.domains ?? [];
    const domain = domains.find((entry) => entry.hostname === hostname);

    // Both an unreadable workspace and an unlisted hostname are "not yours to
    // act on" — answering them differently would map the org's app names
    if (!domain?.app) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const flyApi = await getFlyApi();

    if (flyApi.status !== 'ready') {
      if (flyApi.status === 'unreachable') {
        req.payload.logger.error(
          `[tenantDomainCertificate] Fly credentials unreadable: ${flyApi.error}`
        );
      }
      return fail(
        StatusCodes.SERVICE_UNAVAILABLE,
        flyUnavailableMessage[flyApi.status]
      );
    }

    const { fly } = flyApi;

    const app = domain.app;
    let result: Result;

    try {
      if (action === 'request') {
        const { certificate, check } = await fly.certs.add(app, hostname);
        result = { certificate: toCertificateState(certificate), check };
      } else if (action === 'check') {
        const [certificate, check] = await Promise.all([
          fly.certs.get(app, hostname),
          fly.certs.check(app, hostname)
        ]);
        result = { certificate: toCertificateState(certificate), check };
      } else {
        await fly.certs.remove(app, hostname);
        result = { certificate: null, check: null };
      }
    } catch (error) {
      req.payload.logger.error(
        `[tenantDomainCertificate] ${action} failed for ${hostname} on ${app}: ${String(error)}`
      );
      // Fly's own wording is the useful part here: it names rate limits,
      // unknown apps and permission problems better than a generic message
      return fail(
        StatusCodes.BAD_GATEWAY,
        error instanceof Error ? error.message : String(error)
      );
    }

    await req.payload.update({
      collection: 'tenants',
      id: tenantId,
      data: {
        domains: applyCertificateState(domains, hostname, result.certificate)
      },
      depth: 0,
      // The caller is authorized above, and by the read that found this row.
      // The write itself is the platform recording its own answer, not an edit.
      overrideAccess: true,
      req
    });

    return Response.json(result, {
      status: StatusCodes.OK,
      headers: headersWithCors({ headers: new Headers(), req })
    });
  }
};
