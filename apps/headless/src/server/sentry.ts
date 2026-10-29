import * as Sentry from '@sentry/tanstackstart-react';

import { EnvSchema } from '../env.schema';
import { sentryOptions } from '../sentry';

const SentryEnv = EnvSchema.pick({
  DEPLOY_ENV: true,
  SENTRY_DSN: true,
  SENTRY_RELEASE: true
});

/**
 * Starts Sentry in the server, once, as the server entry loads.
 *
 * Inside the bundle rather than through `node --import`, so the server starts
 * with a plain `node .output/server/index.mjs` and no instrument file has to be
 * copied next to it. Errors are captured either way; what the preload would add
 * is automatic tracing of Node's own modules, such as outgoing `fetch`.
 *
 * Reads only its own variables, so a broken environment still fails per
 * request, with its message, rather than at boot; Sentry then stays off and
 * says so.
 */
export function initSentryServer(env: NodeJS.ProcessEnv = process.env) {
  const result = SentryEnv.safeParse(env);
  if (!result.success) {
    console.warn(
      'Sentry is off, invalid environment:',
      JSON.stringify(result.error.flatten().fieldErrors)
    );
    return;
  }
  if (!result.data.SENTRY_DSN || Sentry.getClient()) {
    return;
  }

  Sentry.init(
    sentryOptions({
      dsn: result.data.SENTRY_DSN,
      environment: result.data.DEPLOY_ENV,
      release: result.data.SENTRY_RELEASE
    })
  );
}
