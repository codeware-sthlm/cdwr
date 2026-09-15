import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { getSentrySampleRate } from '@codeware/shared/util/pure';
import * as Sentry from '@sentry/nextjs';

const env = getEnv();
const enabled = !!env.SENTRY;

Sentry.init({
  enabled,
  dsn: env.SENTRY?.dsn,
  environment: env.DEPLOY_ENV,
  release: env.SENTRY?.release,

  // Tenants share this project and release, so the tag is what separates them.
  // A host deployment serves every tenant, so it tags per request instead
  // (see `setSentryTenantTag`).
  initialScope: {
    tags: {
      mode: env.APP_MODE.type,
      ...(env.APP_MODE.type === 'tenant' && { tenant: env.APP_MODE.tenantId })
    }
  },

  // Percentage of transactions sent to Sentry (0.0 to 1.0)
  tracesSampleRate: getSentrySampleRate(env.DEPLOY_ENV),

  //tracePropagationTargets: [/^\/api\//],

  // Capture server-side console logs
  // Use Sentry logger to send structured logs from anywhere in your application.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#logs-
  enableLogs: true,

  // A report keeps the page, the error and the browser, but not what the
  // visitor sent or their cookies. With `sendDefaultPii` left off it carries
  // no IP address either.
  integrations: [
    Sentry.requestDataIntegration({ include: { cookies: false, data: false } })
  ]
});

if (enabled) {
  console.log('[SENTRY] Sentry initialized for server runtime');

  // Verify configuration
  const client = Sentry.getClient();
  if (client) {
    const options = client.getOptions();
    console.log('[SENTRY] Server config:', {
      enabled: options.enabled,
      environment: options.environment,
      dsn: options.dsn ? `${options.dsn.substring(0, 20)}...` : 'not set',
      tracesSampleRate: options.tracesSampleRate,
      enableLogs: options.enableLogs,
      sendDefaultPii: options.sendDefaultPii
    });
  } else {
    console.warn('[SENTRY] Server client not initialized!');
  }
} else {
  console.log('[SENTRY] Sentry is disabled (no SENTRY config found)');
}
