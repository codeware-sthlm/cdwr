import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { parse as parseEnv } from 'dotenv';

// The suite is ESM, so the module's own directory has to be derived
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where global setup left the cookie it collected by opening the gate */
const GATE_COOKIE_FILE = join(__dirname, '..', '..', '.auth', 'site-gate.json');

/** Name the apps set, kept here so the suite does not import app code */
export const SITE_GATE_COOKIE = 'cdwr-site-gate';

/** The password headless runs with, from the same file the config reads */
export const SITE_GATE_PASSWORD =
  parseEnv(readFileSync(join(__dirname, '..', '..', '.env.e2e')))[
    'SITE_GATE_PASSWORD'
  ] ?? '';

let cached: string | null | undefined;

/**
 * The site gate cookie global setup collected, or null before it has run.
 *
 * Read once per worker. Deliberately not part of `storageState`: an empty
 * storage state is how a spec says "no session", and the gate is not one.
 */
export const siteGateCookie = (): string | null => {
  if (cached === undefined) {
    cached = existsSync(GATE_COOKIE_FILE)
      ? (JSON.parse(readFileSync(GATE_COOKIE_FILE, 'utf8')).value as string)
      : null;
  }

  return cached;
};
