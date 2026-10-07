import {
  flyUnavailableMessage,
  getFlyApi
} from '@codeware/app-cms/feature/domains';
import { hasRole } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

type Body = { tenant?: unknown; app?: unknown };

type Result = { restarted: Array<string> };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * Restart every machine on a Fly app, so a boot-read setting — a newly
 * validated domain — takes effect.
 *
 * Restricted to system users, matching who may edit a workspace at all. The
 * app name comes from the request, but is only accepted once it matches an
 * app already named on one of the tenant's own domain rows — the same
 * "written down against a specific app" guard as `tenant-domain-certificate`.
 * The Fly token is org-scoped, so without this check the endpoint could be
 * used to restart any app in the organisation.
 */
export const tenantMachineRestartEndpoint: Endpoint = {
  path: '/tenant-machine-restart',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;

    const tenantId = Number(body.tenant);
    const app = String(body.app ?? '');

    if (!Number.isInteger(tenantId) || tenantId < 1 || !app) {
      return fail(StatusCodes.BAD_REQUEST);
    }

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

    // An app nobody wrote down against this tenant is not this tenant's to
    // restart, whatever the org-scoped token could otherwise reach
    if (!domains.some((domain) => domain.app === app)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const flyApi = await getFlyApi();

    if (flyApi.status !== 'ready') {
      if (flyApi.status === 'unreachable') {
        req.payload.logger.error(
          `[tenantMachineRestart] Fly credentials unreadable: ${flyApi.error}`
        );
      }
      return fail(
        StatusCodes.SERVICE_UNAVAILABLE,
        flyUnavailableMessage[flyApi.status]
      );
    }

    const { fly } = flyApi;

    let result: Result;

    try {
      result = { restarted: await fly.machines.restart(app) };
    } catch (error) {
      req.payload.logger.error(
        `[tenantMachineRestart] restart failed for ${app}: ${String(error)}`
      );
      // Fly's own wording is the useful part here: it names unknown apps and
      // permission problems better than a generic message
      return fail(
        StatusCodes.BAD_GATEWAY,
        error instanceof Error ? error.message : String(error)
      );
    }

    return Response.json(result, {
      status: StatusCodes.OK,
      headers: headersWithCors({ headers: new Headers(), req })
    });
  }
};
