import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { Browser, BrowserContext } from '@playwright/test';

// The suite is ESM, so the module's own directory has to be derived
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where global setup left the cookie it collected by opening the gate */
const GATE_COOKIE_FILE = join(__dirname, '..', '..', '.auth', 'site-gate.json');

/** Name the apps set, kept here so the suite does not import app code */
export const SITE_GATE_COOKIE = 'cdwr-site-gate';

let cached: string | null | undefined;

/**
 * The site gate cookie, or null when the suite runs ungated.
 *
 * Read once per worker. Deliberately not part of `storageState`: an empty
 * storage state is how a spec says "no Payload session", which most of the
 * permissions specs do, and the gate is not a session.
 */
export const siteGateCookie = (): string | null => {
  if (cached === undefined) {
    cached =
      process.env['SITE_GATE_PASSWORD'] && existsSync(GATE_COOKIE_FILE)
        ? (JSON.parse(readFileSync(GATE_COOKIE_FILE, 'utf8')).value as string)
        : null;
  }

  return cached;
};

/**
 * A context that is through the site gate, for a spec building its own.
 *
 * The fixtures carry the cookie for `page` and `request`, but a spec that
 * calls `browser.newContext()` gets neither — and the public submit endpoints
 * refuse a visitor who has not passed the gate.
 */
export async function newGatedContext(
  browser: Browser,
  baseURL = 'http://localhost:3000'
): Promise<BrowserContext> {
  const context = await browser.newContext();
  const cookie = siteGateCookie();

  if (cookie) {
    await context.addCookies([
      { name: SITE_GATE_COOKIE, url: baseURL, value: cookie }
    ]);
  }

  return context;
}
