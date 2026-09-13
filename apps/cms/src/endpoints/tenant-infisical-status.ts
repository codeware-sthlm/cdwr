import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { InfisicalStatus } from '@codeware/app-cms/ui/provisioning';
import { hasRole } from '@codeware/app-cms/util/misc';
import { createClient, statusOf } from '@codeware/shared/feature/infisical';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

import {
  isProvisioningEnvironment,
  readInfisicalStatus
} from '../provisioning/read-infisical-status';

/** Long enough that reopening a workspace does not sign in to Infisical again */
const CACHE_TTL_MS = 60_000;

const cache = new Map<
  string,
  { at: number; promise: Promise<InfisicalStatus> }
>();

type Body = { tenant?: unknown; refresh?: unknown };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * What Infisical holds for a workspace, in this app's environment, for its panel.
 *
 * Host mode on a deployed app only, and system users only, matching who may
 * edit a workspace. Only the app's own environment is read: the key is compared
 * with this app's database, so judging another environment's folders against
 * it could only ever report a different key.
 *
 * The deployment name and the API key are read from the stored workspace,
 * never from the request, so a caller cannot point the read at another
 * folder. The key is compared on the server; the answer holds verdicts only.
 */
export const tenantInfisicalStatusEndpoint: Endpoint = {
  path: '/tenant-infisical-status',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    const { APP_MODE, DEPLOY_ENV } = getEnv();

    if (APP_MODE.type !== 'host' || !isProvisioningEnvironment(DEPLOY_ENV)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;
    const tenantId = Number(body.tenant);

    if (!Number.isInteger(tenantId) || tenantId < 1) {
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

    if (!tenant) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const { deployment, apiKey } = tenant;

    if (!deployment) {
      return fail(
        StatusCodes.CONFLICT,
        'This workspace has no deployment name yet.'
      );
    }

    // Any saved change - a new name or a rotated key - moves `updatedAt`, so it
    // is never answered from the read before it
    const cacheKey = [tenant.id, deployment, tenant.updatedAt].join('|');

    const cached = cache.get(cacheKey);
    const fresh =
      body.refresh !== true && cached && Date.now() - cached.at < CACHE_TTL_MS;

    const promise = fresh
      ? cached.promise
      : createClient({}).then(({ client, projectId }) =>
          readInfisicalStatus({
            client,
            environments: [DEPLOY_ENV],
            projectId,
            deployment,
            apiKey,
            statusOf
          })
        );

    if (!fresh) {
      cache.set(cacheKey, { at: Date.now(), promise });
    }

    try {
      return Response.json(await promise, {
        status: StatusCodes.OK,
        headers: headersWithCors({ headers: new Headers(), req })
      });
    } catch (error) {
      // Never keep a failed read — the next open should try again
      cache.delete(cacheKey);

      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('Could not resolve Infisical credentials')) {
        return fail(
          StatusCodes.SERVICE_UNAVAILABLE,
          'No Infisical credentials are configured for this platform.'
        );
      }

      req.payload.logger.error(
        `[tenantInfisicalStatus] Reading ${deployment} failed: ${message}`
      );
      return fail(StatusCodes.BAD_GATEWAY, 'Infisical could not be read.');
    }
  }
};
