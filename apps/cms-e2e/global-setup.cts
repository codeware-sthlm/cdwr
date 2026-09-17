import { mkdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { request } from '@playwright/test';

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000';
// Try for max 1 minute with 2s intervals
const MAX_ATTEMPTS = 30;
const INTERVAL_MS = 2_000;
// Use the system user account to verify the server is fully ready
const EMAIL = 'system@local.dev';
const PASSWORD = 'dev';
/** Where the cookie that gets every other spec through the gate is kept */
const GATE_COOKIE_FILE = resolve(__dirname, '.auth/site-gate.json');

/**
 * Playwright global setup — waits until the CMS is fully ready.
 *
 * `webServer.url` only verifies the HTTP server accepts connections.
 * This setup additionally waits for DB migrations and seed data by polling
 * /api/users/login until a valid JWT token is returned, which proves the
 * server, database, and seed user are all functional.
 */
module.exports = async function globalSetup() {
  const ctx = await request.newContext({ baseURL: BASE_URL });

  console.log(`[setup] Waiting for CMS to be ready at ${BASE_URL}…`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await ctx.post('/api/users/login', {
        data: { email: EMAIL, password: PASSWORD }
      });

      if (res.ok()) {
        const body = await res.json();
        if (typeof body?.token === 'string') {
          console.log(`[setup] CMS ready after ${attempt} attempt(s)`);
          break;
        }
      }
    } catch {
      // Server not yet reachable — swallow network errors and retry
    }

    if (attempt === MAX_ATTEMPTS) {
      await ctx.dispose();
      throw new Error(
        `[setup] CMS did not become ready after ${MAX_ATTEMPTS} attempts (~${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s). ` +
          `Check that the server started and seed data was applied.`
      );
    }

    console.log(
      `[setup] CMS not ready (${attempt}/${MAX_ATTEMPTS}), retrying in ${INTERVAL_MS}ms…`
    );
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  // Walk through the site gate, once, and keep the cookie for every context.
  //
  // The suite runs gated so the gate is exercised by every spec rather than
  // only its own — which also means this has to happen before the warmup
  // below, or every route would compile the gate page instead.
  const sitePassword = process.env['SITE_GATE_PASSWORD'];

  if (sitePassword) {
    const opened = await ctx.post('/api/site-gate', {
      form: { from: '/', password: sitePassword }
    });

    const gate = (await ctx.storageState()).cookies.find(
      (cookie) => cookie.name === 'cdwr-site-gate'
    );

    if (!opened.ok() || !gate) {
      await ctx.dispose();
      throw new Error(
        '[setup] SITE_GATE_PASSWORD is set but the gate did not open — ' +
          `POST /api/site-gate answered ${opened.status()} and left no cookie.`
      );
    }

    // Only the cookie, not a whole storage state: a storage state would also
    // carry a Payload session, and the many specs that deliberately have none
    // set their own empty one. The fixtures add this cookie on top of
    // whichever state a spec chose.
    //
    // Written to a private name and renamed into place, since the specs are
    // atomized into one CI task each and several setups can run at once.
    const pending = `${GATE_COOKIE_FILE}.${process.pid}`;

    mkdirSync(dirname(GATE_COOKIE_FILE), { recursive: true });
    writeFileSync(pending, JSON.stringify({ value: gate.value }));
    renameSync(pending, GATE_COOKIE_FILE);
    console.log('[setup] Site gate opened for the suite');
  }

  // Next.js dev mode compiles routes on first request (JIT). In CI this compilation
  // can take 20-40 seconds per route, causing tests that rely on those routes to time
  // out before the first real assertion. Pre-warming here triggers compilation during
  // setup so tests run against already-compiled routes.
  const warmupRoutes = [
    '/',
    '/lunar-maria',
    '/lunar-craters',
    '/lunar-phases',
    '/admin/collections/pages',
    '/admin/collections/pages/create',
    '/admin/collections/posts'
  ];

  console.log('[setup] Pre-warming routes for Next.js JIT compilation…');
  await Promise.allSettled(warmupRoutes.map((route) => ctx.get(route)));
  console.log('[setup] Route warmup complete');

  await ctx.dispose();
};
