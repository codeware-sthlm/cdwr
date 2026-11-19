import type { TenantStateRow, TenantsPayload } from '../supabase';
import type { Json } from '../supabase.types';

import { SHARED_KEY } from './model';

// Rows as the NUC writes them, for the specs

export const NOW = new Date('2026-11-15T12:00:00.000Z');
export const MAIN = 'a'.repeat(40);
export const BEHIND = 'b'.repeat(40);
/** The newest cms release, and the one before it that a machine behind still runs */
export const LATEST = 'cms-1.65.4';
export const OLDER = 'cms-1.65.3';

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
  sentry: {},
  visitors: {},
  deploy: {},
  backup: {},
  errors: {},
  ...over
});

/** A tenant's `sentry` column; a quiet week unless told otherwise */
export const sentry = (over: Record<string, Json> = {}): Json => ({
  org: 'cdwr',
  count24h: 2,
  count7d: 14,
  top: null,
  ...over
});

export const topIssue = (over: Record<string, Json> = {}): Json => ({
  shortId: 'CMS-4F',
  level: 'error',
  count: 31,
  title: 'TypeError: x is undefined',
  ...over
});

/** A tenant's `visitors` column: today, and seven days before it, oldest first */
export const visitors = (
  today = 12,
  days: number[] = [8, 9, 11, 10, 14, 9, 12]
): Json => ({
  today,
  days: days.map((n, i) => ({ date: `2026-11-0${i + 8}`, visitors: n }))
});

/** The shared row's `deploy` column */
export const deployRun = (over: Record<string, Json> = {}): Json => ({
  runId: 4242,
  sha: MAIN,
  conclusion: 'success',
  url: 'https://github.com/codeware/cdwr/actions/runs/4242',
  at: '2026-11-15T11:30:00.000Z',
  ...over
});

/** The shared row's `backup` column: a dump made `ageH` hours before NOW */
export const backupState = (
  ageH = 10,
  over: Record<string, Json> = {}
): Json => ({
  newest: 'cms-production-2026-11-15T02-05-11',
  newestAt: new Date(NOW.getTime() - ageH * 36e5).toISOString(),
  count: 7,
  bytes: 48 * 2 ** 20,
  lastRun: { at: minutesAgo(ageH * 60), ok: true, error: null },
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
    poolerSessions: 3,
    byApplication: { 'cdwr-cms': 3 },
    connections: 3,
    limit: 57,
    peak: { connections: 9, at: '2026-10-29T08:15:00.000Z' },
    opened: 4
  },
  sentry: {},
  visitors: {},
  deploy: {},
  backup: {},
  errors: {},
  ...over
});

export const payload = (
  rows: TenantStateRow[],
  main: string | null = MAIN
): TenantsPayload => ({ rows, main });
