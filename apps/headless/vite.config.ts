import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { sentryUploadEnabled } from './src/sentry-upload';

export default defineConfig(({ mode }) => {
  // Server functions read `process.env`, which Vite does not fill from `.env`;
  // anything already set in the shell wins
  process.env = {
    ...loadEnv(mode, import.meta.dirname, ''),
    ...process.env
  };

  // Source maps are made only to be uploaded, and deleted once they are, so
  // the shipped output never holds one
  const sentryUpload = sentryUploadEnabled(process.env);

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/headless',
    server: { port: 4300 },
    build: {
      // Hidden: no `sourceMappingURL` comment points at a file that is gone
      sourcemap: sentryUpload ? 'hidden' : false
    },
    // The browser has no runtime env. The image is built per app and
    // environment, and the release must match the maps uploaded by this build
    // (`DEPLOY_ENV` defaults as the server's env schema does)
    define: {
      'import.meta.env.DEPLOY_ENV': JSON.stringify(
        process.env.DEPLOY_ENV || 'development'
      ),
      'import.meta.env.SENTRY_DSN': JSON.stringify(
        process.env.SENTRY_DSN ?? ''
      ),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(
        process.env.SENTRY_RELEASE ?? ''
      )
    },
    plugins: [
      tsconfigPaths({ projects: ['../../tsconfig.base.json'] }),
      tailwindcss(),
      tanstackStart(),
      nitro(),
      // React's plugin after Start's, as its docs say
      react(),
      ...(sentryUpload
        ? [
            sentryVitePlugin({
              authToken: process.env.SENTRY_AUTH_TOKEN,
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              telemetry: false,
              // The deploy workflow creates and finalizes the release
              release: {
                name: process.env.SENTRY_RELEASE,
                create: false,
                finalize: false
              },
              sourcemaps: {
                filesToDeleteAfterUpload: [
                  `${import.meta.dirname}/.output/**/*.map`
                ]
              }
            })
          ]
        : [])
    ]
  };
});
