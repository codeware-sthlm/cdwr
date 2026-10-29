import * as Sentry from '@sentry/tanstackstart-react';
import type { AnyRouter } from '@tanstack/react-router';
import { createClientOnlyFn } from '@tanstack/react-start';

import { sentryOptions } from './sentry';

/**
 * Starts Sentry in the browser, once; on the server it does nothing, since the
 * server entry starts its own. The values are set at build time (`define` in
 * `vite.config.ts`): the browser has no runtime env, and the release has to
 * match the source maps uploaded by the same build.
 */
export const initSentryClient = createClientOnlyFn((router: AnyRouter) => {
  if (!import.meta.env.SENTRY_DSN || Sentry.getClient()) {
    return;
  }

  Sentry.init({
    ...sentryOptions({
      dsn: import.meta.env.SENTRY_DSN,
      environment: import.meta.env.DEPLOY_ENV,
      release: import.meta.env.SENTRY_RELEASE || undefined
    }),
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)]
  });
});
