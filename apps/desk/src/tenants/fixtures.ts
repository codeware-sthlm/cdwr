import type { TenantStateRow, TenantsPayload } from '../supabase';
import type { Json } from '../supabase.types';

import { SHARED_KEY } from './model';

// Rows as the NUC writes them, for the specs

export const NOW = new Date('2026-11-15T12:00:00.000Z');
export const MAIN = 'a'.repeat(40);
export const BEHIND = 'b'.repeat(40);

export const minutesAgo = (min: number): string =>
  new Date(NOW.getTime() - min * 6e4).toISOString();

export const machine = (over: Record<string, Json> = {}): Json => ({
  id: 'm1',
  state: 'started',
  region: 'arn',
  memoryMb: 512,
  image: 'registry.fly.io/cdwr:deployment-1',
  sha: MAIN,
  ...over
});

export const flyApp = (
  app: string,
  kind: string,
  over: Record<string, Json> = {}
): Json => ({
  app,
  kind,
  machines: [machine()],
  certs: [{ hostname: 'x.example.com', state: 'Ready' }],
  health: { ok: true, status: 200, ms: 120 },
  ...over
});

export const domain = (
  hostname: string,
  over: Record<string, Json> = {}
): Json => ({
  hostname,
  app: 'cdwr-cms-acme',
  primary: true,
  certificate: 'Ready',
  recordedCertificate: 'ready',
  ...over
});

export const flag = (
  tenant: string | null,
  value: string,
  app = 'cms'
): Json => ({ app, environment: 'production', tenant, flag: value });

/** A healthy tenant, on main, with a ready certificate and its switch on */
export const tenant = (
  key: string,
  over: Partial<TenantStateRow> = {}
): TenantStateRow => ({
  key,
  at: minutesAgo(3),
  name: key.toUpperCase(),
  deployment: key,
  status: 'active',
  apps: [
    flyApp(`cdwr-cms-${key}`, 'cms'),
    flyApp(`cdwr-headless-${key}`, 'headless')
  ],
  domains: [domain(`${key}.example.com`)],
  switches: [flag(key, 'on')],
  db: {},
  errors: {},
  ...over
});

/** The shared row: the host apps and the database */
export const shared = (over: Partial<TenantStateRow> = {}): TenantStateRow => ({
  key: SHARED_KEY,
  at: minutesAgo(3),
  name: null,
  deployment: null,
  status: null,
  apps: [flyApp('cdwr-cms', 'cms')],
  domains: [],
  switches: [flag(null, 'on')],
  db: {
    sizeBytes: 120 * 2 ** 20,
    sessions: 5,
    byApplication: { 'cdwr-cms': 3 }
  },
  errors: {},
  ...over
});

export const payload = (
  rows: TenantStateRow[],
  main: string | null = MAIN
): TenantsPayload => ({ rows, main });
