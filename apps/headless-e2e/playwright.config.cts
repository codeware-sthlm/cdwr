import { readFileSync } from 'fs';
import { resolve } from 'path';

import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { parse as parseEnv } from 'dotenv';

import { BASE_URL, CMS_PORT, CMS_URL, HEADLESS_PORT } from './src/helpers/urls';

// Each server gets its own env below. Nothing is applied to this process, so a
// value meant for one server cannot reach the other
const { SITE_GATE_PASSWORD, ...cmsEnv } = parseEnv(
  readFileSync(resolve(workspaceRoot, 'apps/headless-e2e/.env.e2e'))
);

export default defineConfig({
  ...nxE2EPreset(__dirname, { testDir: './src' }),
  globalSetup: require.resolve('./global-setup.cts'),
  fullyParallel: false,
  workers: 1,
  // The cms runs `next dev`, which compiles each route on first visit, and
  // headless renders from it. A generous assertion timeout absorbs that
  // without costing anything on a green run
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      // Host mode: the platform's own site and the Payload api headless reads
      command: 'pnpm exec nx run cms:dev:host',
      url: `${CMS_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 120_000,
      env: {
        ...cmsEnv,
        PORT: CMS_PORT,
        // Payload's serverURL defaults to port 3000 otherwise
        PAYLOAD_URL: CMS_URL,
        // Host mode, and no gate: only headless is closed behind a password
        TENANT_ID: '',
        SITE_GATE_PASSWORD: ''
      },
      // Without this Playwright kills the shell it started and `next dev`'s own
      // server survives, reparented and still holding its port, which the next
      // run then reuses
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }
    },
    {
      // The built server, as it runs in production. `start` builds first, and
      // the built server reads no `.env`, so everything it needs is set here.
      // The gate page answers without the cms.
      // Never reused: the gate allows 10 wrong guesses per address per 10
      // minutes, and a reused server would carry them across reruns
      command: 'pnpm exec nx run headless:start',
      url: `http://localhost:${HEADLESS_PORT}/site-gate`,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: 300_000,
      env: {
        NODE_ENV: 'production',
        PORT: HEADLESS_PORT,
        PAYLOAD_URL: CMS_URL,
        TENANT_ID: 'moon',
        // Tenant moon's key from the seed (`platform.ts`)
        PAYLOAD_API_KEY: 'b9c2fb25-df77-4304-a60a-028779a2cb37',
        SIGNATURE_SECRET: cmsEnv['SIGNATURE_SECRET'],
        SITE_GATE_PASSWORD
      },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
