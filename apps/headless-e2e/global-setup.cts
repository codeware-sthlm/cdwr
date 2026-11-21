import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { request } from '@playwright/test';
import { parse as parseEnv } from 'dotenv';

import { BASE_URL, CMS_URL } from './src/helpers/urls';

// Try for max 1 minute with 2s intervals
const MAX_ATTEMPTS = 30;
const INTERVAL_MS = 2_000;
// Use the system user account to verify the cms is fully ready
const EMAIL = 'system@local.dev';
const PASSWORD = 'dev';
/** Where the cookie that gets every other spec through the gate is kept */
const GATE_COOKIE_FILE = resolve(__dirname, '.auth/site-gate.json');

const sitePassword = parseEnv(readFileSync(resolve(__dirname, '.env.e2e')))[
  'SITE_GATE_PASSWORD'
];

/** Retry `attempt` until it returns true, or give up with `failure` */
async function waitFor(
  what: string,
  attempt: () => Promise<boolean>,
  failure: string
) {
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try {
      if (await attempt()) {
        console.log(`[setup] ${what} ready after ${n} attempt(s)`);
        return;
      }
    } catch {
      // Server not yet reachable — swallow network errors and retry
    }

    if (n === MAX_ATTEMPTS) {
      throw new Error(
        `[setup] ${what} did not become ready after ${MAX_ATTEMPTS} attempts (~${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s). ${failure}`
      );
    }

    console.log(
      `[setup] ${what} not ready (${n}/${MAX_ATTEMPTS}), retrying in ${INTERVAL_MS}ms…`
    );
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

/**
 * Playwright global setup — waits until both servers are fully ready.
 *
 * `webServer.url` only verifies each HTTP server accepts connections. The cms
 * is additionally polled on /api/users/login until a valid JWT token is
 * returned, which proves the server, database and seed user are functional.
 * Headless is then walked through its site gate, once, and its cookie kept for
 * every context; /api/health behind the gate proves the built server is up.
 */
module.exports = async function globalSetup() {
  if (!sitePassword) {
    throw new Error('[setup] SITE_GATE_PASSWORD is missing from .env.e2e.');
  }

  const cms = await request.newContext({ baseURL: CMS_URL });

  try {
    await waitFor(
      'CMS',
      async () => {
        const res = await cms.post('/api/users/login', {
          data: { email: EMAIL, password: PASSWORD }
        });

        return res.ok() && typeof (await res.json())?.token === 'string';
      },
      'Check that the server started and seed data was applied.'
    );
  } finally {
    await cms.dispose();
  }

  const ctx = await request.newContext({ baseURL: BASE_URL });

  try {
    // The gate takes a plain form post and answers 303 with the cookie
    await waitFor(
      'Headless',
      async () => {
        const opened = await ctx.post('/site-gate', {
          form: { from: '/', password: sitePassword },
          maxRedirects: 0
        });

        if (opened.status() !== 303) {
          return false;
        }

        const health = await ctx.get('/api/health');
        return health.ok();
      },
      'Check that the build succeeded and the server started.'
    );

    const gate = (await ctx.storageState()).cookies.find(
      (cookie) => cookie.name === 'cdwr-site-gate'
    );

    if (!gate) {
      throw new Error(
        '[setup] The site gate answered but left no cookie — POST /site-gate did not open it.'
      );
    }

    // Only the cookie, not a whole storage state: the specs that need to be
    // outsiders set their own empty one. The fixtures add this cookie on top of
    // whichever state a spec chose.
    //
    // Written to a private name and renamed into place, in case several setups
    // run at once.
    const pending = `${GATE_COOKIE_FILE}.${process.pid}`;

    mkdirSync(dirname(GATE_COOKIE_FILE), { recursive: true });
    writeFileSync(pending, JSON.stringify({ value: gate.value }));
    renameSync(pending, GATE_COOKIE_FILE);
    console.log('[setup] Site gate opened for the suite');

    // Render the routes once, so the first spec does not pay for the cms
    // compiling them on demand
    const warmupRoutes = ['/', '/lunar-maria', '/posts', '/moon-members'];

    console.log('[setup] Pre-warming routes…');
    await Promise.allSettled(warmupRoutes.map((route) => ctx.get(route)));
  } finally {
    await ctx.dispose();
  }
};
