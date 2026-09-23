import { readFileSync } from 'fs';
import { resolve } from 'path';

import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { parse as parseEnv } from 'dotenv';

// Load e2e environment overrides and apply them to the current process so they're
// inherited by all child processes (webServer, coverage, etc.) regardless of
// which executor or e2e target variant is used.
const e2eEnv = parseEnv(
  readFileSync(resolve(workspaceRoot, 'apps/cms-e2e/.env.e2e'))
);
Object.assign(process.env, e2eEnv);

// The dev server runs through the Infisical wrapper, which would otherwise let
// the vault overwrite these — including DATABASE_URL, pointing the run at the
// development database. Derived from the file so it cannot drift
process.env['WITH_SECRETS_PRESERVE'] = Object.keys(e2eEnv).join(',');

const baseURL = process.env['BASE_URL'] || 'http://localhost:3000';

export default defineConfig({
  ...nxE2EPreset(__dirname, { testDir: './src' }),
  globalSetup: require.resolve('./global-setup.cts'),
  globalTeardown: require.resolve('./global-teardown.cts'),
  // Ensure tests run serially to avoid
  fullyParallel: false,
  workers: 1,
  // The web server runs `next dev`, which compiles each route on first visit.
  // A generous assertion timeout absorbs that without costing anything on a
  // green run — only a failing assertion waits this long.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'pnpm exec nx run cms:dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    cwd: workspaceRoot,
    timeout: 120_000,
    // Without this Playwright kills the shell it started and `next dev`'s own
    // server survives, reparented and still holding port 3000 — which the next
    // run then reuses, gate password and all
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
