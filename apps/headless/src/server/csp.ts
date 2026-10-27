import {
  type CspHeaders,
  createCspNonce,
  cspHeaders,
  sentryCspReportUri,
  toOrigin
} from '@codeware/shared/util/csp';

import type { Env } from '../env.schema';

export { createCspNonce };

const defined = (origins: Array<string | undefined>): Array<string> =>
  origins.filter((origin): origin is string => !!origin);

/**
 * Content Security Policy headers for one response.
 *
 * Report-only until `CSP_ENFORCE` is on. The cms serves media and
 * custom-component bundles; browser Sentry is not tunnelled, so its ingest
 * origin is allowed to connect. The cms never frames this app.
 */
export function cspResponseHeaders(
  env: Pick<Env, 'PAYLOAD_URL' | 'SENTRY_DSN' | 'DEPLOY_ENV' | 'CSP_ENFORCE'>,
  nonce: string,
  development = process.env.NODE_ENV === 'development'
): CspHeaders {
  const cms = defined([toOrigin(env.PAYLOAD_URL)]);
  const sentry = defined([toOrigin(env.SENTRY_DSN)]);

  return cspHeaders({
    nonce,
    surface: 'site',
    enforce: env.CSP_ENFORCE,
    sources: {
      script: cms,
      img: cms,
      font: cms,
      style: cms,
      connect: [...cms, ...sentry]
    },
    reportUri: sentryCspReportUri(env.SENTRY_DSN, env.DEPLOY_ENV),
    development
  });
}
