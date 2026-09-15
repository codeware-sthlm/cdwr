import {
  buildTenantConfig,
  getCustomThemes,
  getGeneralSiteSettings
} from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { isTenant } from '@codeware/app-cms/util/misc';
import { verifySignature } from '@codeware/shared/util/signature';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { type Endpoint, type PayloadRequest, headersWithCors } from 'payload';

import { payloadRuntime } from '../security/payload-runtime';

/**
 * Endpoint to retrieve tenant configuration external web client.
 *
 * Only accessible by external web clients authenticating with a tenant API key
 * and a valid request signature. Admin-session users and unauthenticated requests
 * are rejected with 403.
 */
export const tenantConfigEndpoint: Endpoint = {
  path: '/tenant-config',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const { APP_MODE } = getEnv();

    // This endpoint should never be called in tenant mode,
    // as tenant config should be fetched via local api
    if (APP_MODE.type === 'tenant') {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.NOT_ACCEPTABLE) },
        { status: StatusCodes.NOT_ACCEPTABLE }
      );
    }

    // Require the caller to be an authenticated tenant (API key), not an admin user
    if (!isTenant(req.user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    // Verify the required request signature
    const { success, error } = verifySignature({
      headers: req.headers,
      secret: APP_MODE.signatureSecrets
    });

    if (!success) {
      req.payload.logger.info(
        `[tenantConfig] Signature verification failed: ${error}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    const runtime = await payloadRuntime();
    runtime.payload.authenticatedUser = req.user;
    runtime.tenantConfig = null;

    // Fetch tenant config for the authenticated tenant user
    const settings = await getGeneralSiteSettings(runtime);

    if (!settings) {
      return Response.json(
        {
          error: 'Tenant config could not be resolved',
          details: 'Site settings not found or access denied for tenant user'
        },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    const tenantConfig = buildTenantConfig({
      settings,
      customThemes: await getCustomThemes(runtime, settings.customThemeIds),
      tenant: req.user
    });

    return Response.json(tenantConfig, {
      status: 200,
      headers: headersWithCors({
        headers: new Headers(),
        req
      })
    });
  }
};
