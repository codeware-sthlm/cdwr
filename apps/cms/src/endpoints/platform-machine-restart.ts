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

type Body = { app?: unknown };

type Result = { restarted: Array<string> };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * Restart every machine on the host cms's own Fly app, so a boot-read
 * setting — a newly validated domain — takes effect.
 *
 * The platform-settings sibling of `tenantMachineRestartEndpoint`. Same guard
 * — the app is only accepted once it matches one already on the platform's
 * own domain rows — reading `platform-settings` instead of a tenant.
 */
export const platformMachineRestartEndpoint: Endpoint = {
  path: '/platform-machine-restart',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;

    const app = String(body.app ?? '');

    if (!app) {
      return fail(StatusCodes.BAD_REQUEST);
    }

    const { docs } = await req.payload.find({
      collection: 'platform-settings',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: false,
      user: req.user,
      req
    });

    const domains = docs[0]?.domains ?? [];

    // An app nobody wrote down against the platform is not this endpoint's to
    // restart, whatever the org-scoped token could otherwise reach
    if (!domains.some((domain) => domain.app === app)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const flyApi = await getFlyApi();

    if (flyApi.status !== 'ready') {
      if (flyApi.status === 'unreachable') {
        req.payload.logger.error(
          `[platformMachineRestart] Fly credentials unreadable: ${flyApi.error}`
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
        `[platformMachineRestart] restart failed for ${app}: ${String(error)}`
      );
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
