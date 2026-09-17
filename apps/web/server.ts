/**
 * This is the entry point for the Node/Hono server aimed for production.
 */

import { formatReleaseName } from '@codeware/shared/util/pure';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { type RemixMiddlewareOptions, remix } from 'remix-hono/handler';

// TODO: Zod types does not get inferred correctly since the schema depends on `@codeware/shared/util/zod`
// Something is different here since it works in the cms project

import { getAppInfo } from './app/utils/app-info';
import { initSentry } from './app/utils/sentry.server';
import type { AppLoadContext } from './app/utils/types';
import env from './env-resolver/env';
import { debugHeadersMiddleware } from './middlewares/debug-headers';
import { resolveAppLoadContextMiddleware } from './middlewares/resolve-app-load-context.js';
import { siteGateMiddleware } from './middlewares/site-gate';

// Before any request is handled
initSentry();

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

// Load the Remix server build
const build =
  (await import('./build/server/index.js')) as unknown as RemixMiddlewareOptions['build'];

const app = new Hono()
  // Lightweight health check — must not trigger Remix/Payload data fetching
  .get('/api/health', (c) => c.text('ok'))
  // Machine-readable build/version info (same source as the About block)
  .get('/api/version', (c) => {
    const appInfo = getAppInfo();
    return c.json({ ...appInfo, release: formatReleaseName(appInfo) });
  })
  // A gated site stays out of search results as well as out of sight
  .get('/robots.txt', (c) =>
    c.text(
      env.SITE_GATE_PASSWORD
        ? 'User-agent: *\nDisallow: /\n'
        : 'User-agent: *\nAllow: /\n'
    )
  )
  // Serve static files from Remix client build
  .use('*', serveStatic({ root: './build/client' }))
  // Let Remix handle all requests
  .use(
    '*',
    logger(env.DEBUG ? undefined : noop),
    debugHeadersMiddleware,
    siteGateMiddleware,
    resolveAppLoadContextMiddleware,
    remix({
      build,
      mode: env.NODE_ENV as RemixMiddlewareOptions['mode'],
      getLoadContext: (c) => {
        const ctx = {
          deviceId: c.get('deviceId'),
          fallbackLocale: c.get('fallbackLocale'),
          tenantApiKey: c.get('tenantApiKey'),
          tenantId: c.get('tenantId'),
          tenantConfig: c.get('tenantConfig')
        } satisfies AppLoadContext;

        return ctx;
      }
    })
  )
  // Report anything that escapes the Remix handler, then answer with a plain
  // 500 rather than letting the error reach the client
  .onError((error, c) => {
    Sentry.captureException(error);
    console.error(error);
    return c.text('Internal Server Error', 500);
  });

serve(
  {
    fetch: app.fetch,
    port: env.PORT as number
  },
  (info) => {
    console.log('🚀 Server ready');
    console.log(
      'Environment:',
      env.DEPLOY_ENV !== 'production' ? env : Object.keys(env)
    );

    console.log(`Running in ${env.NODE_ENV} mode`);
    console.log(`Hono server listening on port ${info.port}`);
  }
);
