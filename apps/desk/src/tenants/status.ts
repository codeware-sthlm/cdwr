import type { TenantsPayload } from '../supabase';

import { SHARED_KEY, type TenantRow, parseTenantRow } from './model';

// What a tenant's row says: its status, and the state of the view as a whole. Pure; the page draws it.

/** The database's session limit; the NUC's platform step counts against it */
export const DB_SESSIONS_MAX = 15;

/** Sessions from which the shared row warns: three below the limit */
export const DB_SESSIONS_WARN = 12;

/** The rows are stale once the newest was written longer ago than this, in minutes; the NUC writes every 10 */
export const TENANTS_STALE_MIN = 30;

/** `down` when an app's health check fails, `warn` when something is behind or not ready, `off` when the tenant has no deploy switch on, else `ok` */
export type TenantStatus = 'ok' | 'warn' | 'down' | 'off';

/** The worse of two statuses; an `off` tenant is switched off on purpose, so it ranks below `ok` */
const RANK: Record<TenantStatus, number> = { off: 0, ok: 1, warn: 2, down: 3 };

export const worse = (a: TenantStatus, b: TenantStatus): TenantStatus =>
  RANK[b] > RANK[a] ? b : a;

/** Whether a machine's commit is not main's; either may be abbreviated, and an unknown one is not behind */
export const isBehind = (sha: string | null, main: string | null): boolean =>
  sha !== null &&
  main !== null &&
  !sha.startsWith(main) &&
  !main.startsWith(sha);

/** Fly's own word for a certificate that serves */
export const certReady = (state: string): boolean =>
  state.toLowerCase() === 'ready';

/** A certificate that is not ready; `unknown` (Fly was not read) is not one */
export const certPending = (state: string): boolean =>
  !certReady(state) && state !== 'unknown';

export const statusOf = (row: TenantRow, main: string | null): TenantStatus => {
  if (row.apps.some((a) => a.health?.ok === false)) return 'down';
  if (
    row.apps.some((a) => a.machines?.some((m) => isBehind(m.sha, main))) ||
    row.domains.some((d) => certPending(d.certificate)) ||
    (row.db !== null && row.db.sessions >= DB_SESSIONS_WARN)
  )
    return 'warn';
  // A switch that was not read says nothing: the tenant is not off for it
  if (
    row.key !== SHARED_KEY &&
    !row.errors['switches'] &&
    !row.switches.some((s) => s.flag === 'on')
  )
    return 'off';
  return 'ok';
};

export type TenantEntry = { row: TenantRow; status: TenantStatus };

export type TenantsView =
  /** Nothing has arrived yet */
  | { kind: 'loading' }
  /** The table has no row: the NUC has not written yet */
  | { kind: 'empty' }
  | {
      kind: 'ready';
      /** The tenants, by slug */
      tenants: TenantEntry[];
      /** The host apps and the database; null when the NUC wrote no such row */
      shared: TenantEntry | null;
      /** The worst status of all rows, `_shared` included */
      worst: TenantStatus;
      /** The commit main deploys, when it is known */
      main: string | null;
      /** Minutes since the newest row was written; null when no row's time parses */
      ageMin: number | null;
      stale: boolean;
    };

export const tenantsView = (
  payload: TenantsPayload | null,
  now: Date
): TenantsView => {
  if (!payload) return { kind: 'loading' };
  if (!payload.rows.length) return { kind: 'empty' };
  const entries = payload.rows.map((r) => {
    const row = parseTenantRow(r);
    return { row, status: statusOf(row, payload.main) };
  });
  const times = entries.map((e) => e.row.at).filter(Number.isFinite);
  const ageMin = times.length
    ? (now.getTime() - Math.max(...times)) / 6e4
    : null;
  return {
    kind: 'ready',
    tenants: entries
      .filter((e) => e.row.key !== SHARED_KEY)
      .sort((a, b) => a.row.key.localeCompare(b.row.key)),
    shared: entries.find((e) => e.row.key === SHARED_KEY) ?? null,
    worst: entries.map((e) => e.status).reduce(worse),
    main: payload.main,
    ageMin,
    stale: ageMin === null || ageMin > TENANTS_STALE_MIN
  };
};
