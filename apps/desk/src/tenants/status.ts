import type { TenantsPayload } from '../supabase';

import { SHARED_KEY, type TenantRow, parseTenantRow } from './model';
import { type Problem, allProblems, problemsOf } from './problems';
import {
  DB_SESSIONS_MAX,
  DB_SESSIONS_WARN,
  certPending,
  certReady
} from './thresholds';

// What a tenant's row says: its status, and the state of the view as a whole. Pure; the page draws it.

export { DB_SESSIONS_MAX, DB_SESSIONS_WARN, certPending, certReady };

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

/** `down` and `warn` come from the row's problems; `main` is no longer compared, the apps' `behind` says it */
export const statusOf = (row: TenantRow): TenantStatus => {
  const found = problemsOf(row);
  if (found.some((p) => p.severity === 'down')) return 'down';
  if (found.length) return 'warn';
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
      /** Every open problem, worst first */
      problems: Problem[];
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
    return { row, status: statusOf(row) };
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
    problems: allProblems(entries),
    main: payload.main,
    ageMin,
    stale: ageMin === null || ageMin > TENANTS_STALE_MIN
  };
};
