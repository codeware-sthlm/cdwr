import { runComponentBuild } from '@codeware/app-cms/feature/component-builder';
import { createTurnQueue } from '@codeware/shared/util/pure';
import { serve } from '@hono/node-server';

import { createApp } from './app';

const token = process.env['COMPONENT_BUILDER_TOKEN'];
if (!token) {
  console.error('[component-builder] COMPONENT_BUILDER_TOKEN is required.');
  process.exit(1);
}

const port = Number(process.env['PORT'] ?? 3002);
const root = process.env['COMPONENT_TOOLCHAIN_ROOT'] || undefined;

// A build holds a few hundred MB, so they run one at a time
const inBuildTurn = createTurnQueue();

const app = createApp({
  token,
  build: (input) => inBuildTurn(() => runComponentBuild(input, { root }))
});

const server = serve({ fetch: app.fetch, port }, ({ port: listening }) => {
  console.log(`[component-builder] Listening on port ${listening}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
