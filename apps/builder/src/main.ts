import { runComponentBuild } from '@codeware/app-cms/feature/component-builder';
import { withInfisical } from '@codeware/shared/feature/infisical';
import { createTurnQueue } from '@codeware/shared/util/pure';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { createLogger } from './logger';

const logger = createLogger();

// Deployed, the token lives in Infisical under the app's folder, as the cms
// keeps its own; the deploy action only hands over the Infisical credentials
const secretsPath = '/apps/builder';
if (!process.env['BUILDER_TOKEN'] && process.env['INFISICAL_CLIENT_ID']) {
  await withInfisical({
    environment: process.env['DEPLOY_ENV'],
    filter: { path: secretsPath, recurse: true },
    injectEnv: true,
    silent: true
  });
  // Deploy metadata in /apps/builder, not configuration for the running app
  delete process.env['DEPLOY_ENABLED'];
}

// Without a token the service still answers its health check, so a deploy
// that is missing the secret goes through and says so here instead of
// crash-looping; every build is refused until the token arrives
// During a token rollover the previous token is accepted too
const tokens = [
  process.env['BUILDER_TOKEN'],
  process.env['BUILDER_TOKEN_PREVIOUS']
].filter((value): value is string => Boolean(value));
if (process.env['BUILDER_TOKEN']) {
  logger.info('secrets loaded', { path: secretsPath, token: true });
} else {
  logger.warn('no token configured', { path: secretsPath, token: false });
}

const port = Number(process.env['PORT'] ?? 3002);
const root = process.env['COMPONENT_TOOLCHAIN_ROOT'] || undefined;

// A build holds a few hundred MB, so they run one at a time
const inBuildTurn = createTurnQueue();

const app = createApp({
  tokens,
  logger,
  build: (input) => inBuildTurn(() => runComponentBuild(input, { root }))
});

const server = serve({ fetch: app.fetch, port }, ({ port: listening }) => {
  logger.info('listening', { port: listening });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
