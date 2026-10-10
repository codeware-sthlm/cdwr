import {
  CERTIFICATE_ACTIONS,
  type CertificateAction,
  type CertificateResult,
  applyCertificateState,
  flyUnavailableMessage,
  getFlyApi,
  parseHostname,
  runCertificateAction
} from '@codeware/app-cms/feature/domains';
import { hasRole } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

type Body = { hostname?: unknown; action?: unknown };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * Request, re-read or withdraw the TLS certificate for the host cms's own
 * custom domain.
 *
 * The platform-settings sibling of `tenantDomainCertificateEndpoint` — same
 * reasoning, same guard, but reading and writing `platform-settings` instead
 * of a tenant row. Kept as its own endpoint rather than a branch inside the
 * tenant one: the two collections' lookup shapes differ enough (a tenant id
 * from the request vs. the platform's one row) that sharing would mean
 * threading a discriminator through every step, for a handler this size.
 */
export const platformDomainCertificateEndpoint: Endpoint = {
  path: '/platform-domain-certificate',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;

    const action = String(body.action) as CertificateAction;
    const parsed = parseHostname(String(body.hostname ?? ''));

    if (!CERTIFICATE_ACTIONS.includes(action) || !parsed.valid) {
      return fail(StatusCodes.BAD_REQUEST);
    }

    const { hostname } = parsed;

    const { docs } = await req.payload.find({
      collection: 'platform-settings',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: false,
      user: req.user,
      req
    });

    const settings = docs[0];
    const domains = settings?.domains ?? [];
    const domain = domains.find((entry) => entry.hostname === hostname);

    // An unlisted hostname is not this platform's to act on
    if (!settings || !domain?.app) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const flyApi = await getFlyApi();

    if (flyApi.status !== 'ready') {
      if (flyApi.status === 'unreachable') {
        req.payload.logger.error(
          `[platformDomainCertificate] Fly credentials unreadable: ${flyApi.error}`
        );
      }
      return fail(
        StatusCodes.SERVICE_UNAVAILABLE,
        flyUnavailableMessage[flyApi.status]
      );
    }

    const { fly } = flyApi;

    const app = domain.app;
    let result: CertificateResult;

    try {
      result = await runCertificateAction(fly, app, hostname, action);
    } catch (error) {
      req.payload.logger.error(
        `[platformDomainCertificate] ${action} failed for ${hostname} on ${app}: ${String(error)}`
      );
      return fail(
        StatusCodes.BAD_GATEWAY,
        error instanceof Error ? error.message : String(error)
      );
    }

    await req.payload.update({
      collection: 'platform-settings',
      id: settings.id,
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
