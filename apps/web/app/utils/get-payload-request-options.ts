import type {
  MethodOptions,
  RequestBaseOptions
} from '@codeware/shared/util/payload-api';
import type { RestApiMethod } from '@codeware/shared/util/payload-types';

import env from '../../env-resolver/env';

import type { AppLoadContext } from './types';

/**
 * Get the options for a request to the Payload REST API.
 *
 * Api key authorization and signature verification are enabled.
 *
 * @param context - The context of the request.
 * @param headers - Request headers.
 * @returns The options for the request.
 */
export function getPayloadRequestOptions(
  method: 'GET',
  context: Omit<AppLoadContext, 'cspNonce'>,
  headers?: Headers
): RequestBaseOptions;
export function getPayloadRequestOptions<TBody = Record<string, unknown>>(
  method: 'POST',
  context: Omit<AppLoadContext, 'cspNonce'>,
  headers?: Headers,
  body?: TBody
): RequestBaseOptions & MethodOptions<'POST'>;
export function getPayloadRequestOptions<
  T extends RestApiMethod,
  TBody = Record<string, unknown>
>(
  method: T,
  context: Omit<AppLoadContext, 'cspNonce'>,
  headers?: Headers,
  body?: TBody
): RequestBaseOptions | (RequestBaseOptions & MethodOptions<'POST'>) {
  const { deviceId, fallbackLocale, tenantApiKey, tenantConfig, tenantId } =
    context;

  const baseOptions: RequestBaseOptions = {
    apiUrl: env.PAYLOAD_URL,
    debug: env.DEBUG,
    headers,
    locale: tenantConfig?.locale ?? 'en',
    signatureVertification: {
      deployEnv: env.DEPLOY_ENV,
      deviceId,
      secret: env.SIGNATURE_SECRET,
      tenantId,
      userAgent: headers?.get('User-Agent') ?? null
    },
    tenantApiKey
  };

  if (method === 'GET') {
    return baseOptions;
  }

  return {
    ...baseOptions,
    body: body ?? {}
  };
}
