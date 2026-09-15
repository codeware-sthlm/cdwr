import { getSentrySampleRate } from '@codeware/shared/util/pure';
import * as Sentry from '@sentry/nextjs';
import { isbot } from 'isbot';

// Client-side env variables must use NEXT_PUBLIC_ prefix
type ClientEnv = {
  DEPLOY_ENV?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
};
const env = {
  DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV,
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE
} as ClientEnv;

const enabled = !!env.SENTRY_DSN;

Sentry.init({
  enabled,
  dsn: env.SENTRY_DSN,
  environment: env.DEPLOY_ENV,
  release: env.SENTRY_RELEASE,

  // Use Sentry logger to send structured logs from anywhere in your application.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#logs-
  enableLogs: true,

  // Percentage of transactions sent to Sentry (0.0 to 1.0)
  tracesSampleRate: getSentrySampleRate(env.DEPLOY_ENV),

  // Filter out all errors from bot crawlers
  // Bots often trigger false positives due to:
  // - Stale HTML referencing old chunks after deployments
  // - Machine suspend/resume causing temporary unavailability
  // - Aggressive crawling patterns that don't match real user behavior
  beforeSend(event) {
    // Extract user agent from various possible locations in the event
    const userAgent =
      event.request?.headers?.['User-Agent'] ||
      event.request?.headers?.['user-agent'] ||
      (event.contexts?.browser as { name?: string })?.name ||
      '';

    // Use the official isbot registry to detect crawlers
    if (typeof userAgent === 'string' && isbot(userAgent)) {
      return null;
    }

    return event;
  },

  integrations: [
    Sentry.browserTracingIntegration(),

    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })

    // No Session Replay: it records what is on screen and keeps state in the
    // visitor's browser, which would need consent on every public site
  ]
});

// Required export to enable instrument router navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (enabled) {
  console.log('[SENTRY] Sentry initialized for client runtime');

  // Verify configuration (only in browser, not during SSR)
  if (typeof window !== 'undefined') {
    const client = Sentry.getClient();
    if (client) {
      const {
        enabled,
        environment,
        dsn,
        release,
        tracesSampleRate,
        integrations
      } = client.getOptions();
      console.log('[SENTRY] Client config:', {
        enabled,
        environment,
        dsn: dsn ? `${dsn.substring(0, 15)}[REDACTED]` : 'not set',
        release,
        tracesSampleRate: tracesSampleRate,
        integrations: integrations.length
      });
    } else {
      console.warn('[SENTRY] Client not initialized!');
    }
  }
} else {
  console.log('[SENTRY] Sentry is disabled (NEXT_PUBLIC_SENTRY_DSN not set)');
  console.log('[SENTRY] Available env:', {
    DEPLOY_ENV: env.DEPLOY_ENV,
    SENTRY_DSN: env.SENTRY_DSN ? 'set' : 'not set',
    SENTRY_RELEASE: env.SENTRY_RELEASE
  });
}
