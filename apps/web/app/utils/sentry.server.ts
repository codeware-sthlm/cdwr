import {
  formatReleaseName,
  getSentrySampleRate
} from '@codeware/shared/util/pure';
import * as Sentry from '@sentry/node';

import env from '../../env-resolver/env';

import { getAppInfo } from './app-info';

/**
 * Initialize Sentry for the Hono server.
 *
 * Must run before the server starts handling requests. Disabled when no DSN is
 * configured, which is the case in local development.
 */
export const initSentry = (): void => {
  const enabled = !!env.SENTRY_DSN;

  Sentry.init({
    enabled,
    dsn: env.SENTRY_DSN,
    environment: env.DEPLOY_ENV,
    // The deploy injects the release resolved by the build workflow; the derived
    // name keeps local runs coherent with the About UI.
    release: env.SENTRY_RELEASE || formatReleaseName(getAppInfo()),

    // Every tenant runs the same image and therefore the same release, so this
    // tag is what tells them apart. A web deployment serves exactly one tenant.
    initialScope: { tags: { tenant: env.TENANT_ID } },

    // Percentage of transactions sent to Sentry (0.0 to 1.0)
    tracesSampleRate: getSentrySampleRate(env.DEPLOY_ENV),

    // Structured logs are opt-in; without this nothing reaches Sentry Logs
    enableLogs: true,

    integrations: [
      // Send console.log, console.warn and console.error calls as logs
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      // A report keeps the page, the error and the browser, but not what the
      // visitor sent or their cookies. With `sendDefaultPii` left off it carries
      // no IP address either.
      Sentry.requestDataIntegration({
        include: { cookies: false, data: false }
      })
    ]
  });

  console.log(
    enabled
      ? `[SENTRY] Initialized for tenant '${env.TENANT_ID}'`
      : '[SENTRY] Disabled (SENTRY_DSN not set)'
  );
};
