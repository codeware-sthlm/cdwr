import type { TenantDb, TenantRow } from './model';
import {
  DB_SESSIONS_MAX,
  DB_SESSIONS_WARN,
  certPending,
  certReady,
  isBehind
} from './status';

// The one-line summaries of a tenant row, as the page's columns and compact line show them

export type Tone = 'ok' | 'wait' | 'bad' | 'muted';

export type Cell = { text: string; tone: Tone };

const NONE: Cell = { text: '–', tone: 'muted' };

/** An app of one kind: its health, or a dash when the tenant has none of it */
export const appCell = (row: TenantRow, kind: 'cms' | 'headless'): Cell => {
  const apps = row.apps.filter((a) => a.kind === kind);
  if (!apps.length) return NONE;
  if (apps.some((a) => a.health?.ok === false))
    return { text: 'down', tone: 'bad' };
  if (apps.every((a) => a.health?.ok === true))
    return { text: 'ok', tone: 'ok' };
  return { text: 'unknown', tone: 'muted' };
};

/**
 * Whether the machines run the newest release: `behind` when the NUC found an app with a machine
 * whose commit does not hold the newest release tag, `current` when it found none or the commit is
 * main's; else their commit, short
 */
export const versionCell = (row: TenantRow, main: string | null): Cell => {
  const shas = row.apps.flatMap((a) =>
    (a.machines ?? []).flatMap((m) => (m.sha ? [m.sha] : []))
  );
  if (!shas.length) return NONE;
  if (row.apps.some((a) => a.behind === true))
    return { text: 'behind', tone: 'wait' };
  const known = row.apps.filter((a) => a.machines?.some((m) => m.sha));
  if (
    known.every((a) => a.behind === false) ||
    (main !== null && !shas.some((s) => isBehind(s, main)))
  )
    return { text: 'current', tone: 'ok' };
  return { text: shas[0].slice(0, 7), tone: 'muted' };
};

/** Every health check of the tenant's apps */
export const healthCell = (row: TenantRow): Cell => {
  const checks = row.apps.flatMap((a) => (a.health ? [a.health] : []));
  if (!checks.length) return NONE;
  const failing = checks.filter((h) => !h.ok).length;
  return failing
    ? { text: `${failing} failing`, tone: 'bad' }
    : { text: 'ok', tone: 'ok' };
};

/** The certificates of the tenant's domains */
export const certCell = (row: TenantRow): Cell => {
  if (!row.domains.length) return NONE;
  const pending = row.domains.filter((d) => certPending(d.certificate)).length;
  if (pending) return { text: `${pending} not ready`, tone: 'wait' };
  return row.domains.every((d) => certReady(d.certificate))
    ? { text: 'ready', tone: 'ok' }
    : { text: 'unknown', tone: 'muted' };
};

/** The database's sessions: the shared row's pooler sessions against the pool size (its total before they were read), a tenant's own by its apps' names where the database tells them apart */
export const sessionsCell = (row: TenantRow, db: TenantDb | null): Cell => {
  if (row.db) {
    const pooler = row.db.pooler;
    if (pooler === null)
      return { text: String(row.db.sessions), tone: 'muted' };
    return {
      text: `${pooler} of ${DB_SESSIONS_MAX}`,
      tone:
        pooler >= DB_SESSIONS_MAX
          ? 'bad'
          : pooler >= DB_SESSIONS_WARN
            ? 'wait'
            : 'ok'
    };
  }
  const own = row.apps.flatMap((a) =>
    db && a.app in db.byApplication ? [db.byApplication[a.app]] : []
  );
  return own.length
    ? { text: String(own.reduce((a, b) => a + b, 0)), tone: 'muted' }
    : NONE;
};

/** How many deploy switches are on, and how many are not */
export const switchesCell = (row: TenantRow): Cell => {
  if (!row.switches.length) return NONE;
  const on = row.switches.filter((s) => s.flag === 'on').length;
  const off = row.switches.length - on;
  return {
    text: off ? `${on} on · ${off} off` : `${on} on`,
    tone: on ? 'ok' : 'muted'
  };
};

/** The tenant's apps by kind, as the compact line names them: `cms ok · headless down` */
export const compactLine = (row: TenantRow, main: string | null): string =>
  (
    [
      ['cms', appCell(row, 'cms')],
      ['headless', appCell(row, 'headless')],
      ['version', versionCell(row, main)]
    ] as const
  )
    .filter(([, cell]) => cell !== NONE)
    .map(([name, cell]) => `${name} ${cell.text}`)
    .join(' · ');
