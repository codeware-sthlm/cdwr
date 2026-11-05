import { randomUUID } from 'node:crypto';

import type { Env } from '@codeware/app-headless/util/env-schema';
import type { RequestBaseOptions } from '@codeware/shared/util/payload-api';

/**
 * Base options for a signed request to the cms headless API.
 *
 * The cms refuses a tenant api key request without a valid signature. Server
 * code only: the api key and secret never reach the browser.
 */
export function payloadRequestOptions(
  env: Env,
  locale: RequestBaseOptions['locale'] = 'en'
): RequestBaseOptions {
  return {
    apiUrl: env.PAYLOAD_URL,
    debug: env.DEBUG,
    locale,
    signatureVertification: {
      deployEnv: env.DEPLOY_ENV,
      deviceId: randomUUID(),
      secret: env.SIGNATURE_SECRET,
      tenantId: env.TENANT_ID,
      userAgent: null
    },
    tenantApiKey: env.PAYLOAD_API_KEY
  };
}
