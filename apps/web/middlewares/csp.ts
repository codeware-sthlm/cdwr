import {
  createCspNonce,
  cspHeaders,
  sentryCspReportUri,
  toOrigin
} from '@codeware/shared/util/csp';
import { createMiddleware } from 'hono/factory';

import env from '../env-resolver/env';

const defined = (origins: Array<string | undefined>): Array<string> =>
  origins.filter((origin): origin is string => !!origin);

/**
 * Content Security Policy for every response.
 *
 * Report-only until `CSP_ENFORCE` is on. The nonce goes to Remix through the
 * load context, so the scripts it renders carry it. The cms serves media and
 * custom-component bundles; browser Sentry is not tunnelled, so its ingest
 * origin is allowed to connect. The cms never frames this app.
 */
export const cspMiddleware = createMiddleware<{
  Variables: { cspNonce: string };
}>(async (c, next) => {
  const nonce = createCspNonce();
  c.set('cspNonce', nonce);

  await next();

  const cms = defined([toOrigin(env.PAYLOAD_URL)]);
  const sentry = defined([toOrigin(env.SENTRY_DSN)]);

  const headers = cspHeaders({
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
    development: env.NODE_ENV === 'development'
  });

  for (const [name, value] of Object.entries(headers)) {
    c.res.headers.set(name, value);
  }
});
