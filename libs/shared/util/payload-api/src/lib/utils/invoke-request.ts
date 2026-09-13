import type {
  RestApiResponse,
  RestApiTarget,
  RestApiTypes
} from '@codeware/shared/util/payload-types';

import { createRequestInit } from './create-request-init';
import { getDepth } from './get-depth';
import type { RequestOptions } from './types';

const getEndpointUrl = (apiUrl: string, target: RestApiTarget) =>
  `${apiUrl}/api/${target}`;

/**
 * Invoke a Payload REST API request with optional
 * API key authorization and signature verification.
 *
 * @param target - The collection or endpoint to invoke the request on.
 * @param options - The options to invoke the request with.
 * @returns The response from the request (`null` is returned when the request is not found) or an error message.
 */
export async function invokeRequest<Target extends 'tenant-config'>(
  target: Target,
  options: RequestOptions
): Promise<
  | {
      data: RestApiTypes[Target] | null;
      count: number;
      status: number;
    }
  | {
      error: string;
      status: number;
      /** What the answer said about waiting, when it said anything */
      retryAfter?: string;
    }
>;

export async function invokeRequest<
  Target extends Exclude<RestApiTarget, 'tenant-config'>
>(
  target: Target,
  options: RequestOptions
): Promise<
  | {
      data: Array<RestApiTypes[Target]> | null;
      count: number;
      status: number;
    }
  | {
      error: string;
      status: number;
      /** What the answer said about waiting, when it said anything */
      retryAfter?: string;
    }
>;
export async function invokeRequest<Target extends RestApiTarget>(
  target: Target,
  options: RequestOptions
): Promise<
  | {
      data: RestApiTypes[Target] | Array<RestApiTypes[Target]> | null;
      count: number;
      status: number;
    }
  | {
      error: string;
      status: number;
      /** What the answer said about waiting, when it said anything */
      retryAfter?: string;
    }
> {
  const {
    apiUrl,
    debug,
    headers,
    locale,
    method,
    requestCredentials,
    signatureVertification,
    tenantApiKey
  } = options;

  const requestInit = createRequestInit(method, {
    headers,
    requestCredentials,
    signatureVertification,
    tenantApiKey
  });

  // Build GET query params
  const queryParams =
    method === 'GET'
      ? [
          options.query,
          `depth=${getDepth(target, options)}`,
          `locale=${locale}`,
          options.limit ? `limit=${options.limit ?? 0}` : ''
        ]
          .filter(Boolean)
          .join('&')
      : '';

  const requestUrl = `${getEndpointUrl(apiUrl, target)}${queryParams ? `?${queryParams}` : ''}`;

  // Apply POST body to request init
  requestInit.body =
    method === 'POST' ? JSON.stringify(options.body) : undefined;

  if (debug) {
    // Named, not printed: the body carries whatever a visitor typed and the
    // headers carry the credentials this request is made with. Debug logging
    // is for seeing that a request went out, not for reading its contents
    console.log(`[PAYLOAD REQUEST] ${method} ${requestUrl}`, {
      ...requestInit,
      body: requestInit.body ? '[redacted]' : undefined,
      headers: Object.keys(requestInit.headers ?? {})
    });
  }

  const response = await fetch(requestUrl, requestInit);

  if (debug) {
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log(
      `[PAYLOAD RESPONSE] ${response.status} ${response.statusText} | ${requestUrl}`,
      responseHeaders
    );
  }

  if (!response.ok) {
    return {
      error: response.statusText,
      status: response.status,
      // Carried so a caller forwarding this on can keep the answer intact —
      // a refused rate that arrives as a plain failure tells nobody to wait
      retryAfter: response.headers.get('retry-after') ?? undefined
    };
  }

  const res = await response.json();

  type SuccessReturn = {
    data: RestApiTypes[Target] | Array<RestApiTypes[Target]> | null;
    count: number;
    status: number;
  };

  // GET response
  if (method === 'GET' && target === 'tenant-config') {
    const typedRes = res as RestApiResponse<'GET', 'tenant-config'>;
    return {
      data: typedRes ?? null,
      count: typedRes ? 1 : 0,
      status: response.status
    } as SuccessReturn;
  }
  if (method === 'GET') {
    const typedRes = res as RestApiResponse<'GET', Target>;
    if ('docs' in typedRes) {
      return {
        data: typedRes.docs ?? null,
        count: typedRes.docs?.length ?? 0,
        status: response.status
      } as SuccessReturn;
    }
    return {
      error: `Invalid response format, expecting docs for GET ${target}`,
      status: 500
    };
  }

  // POST response
  return {
    data: res ? [res as RestApiResponse<'POST', Target>] : null,
    count: res ? 1 : 0,
    status: response.status
  } as SuccessReturn;
}
