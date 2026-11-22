import {
  type Problem,
  SHARED_KEY,
  type TenantRow,
  allProblems,
  parseTenantRow,
  sentryIssueUrl
} from '@codeware/shared/util/platform-problems';
import { z } from 'zod';

import type { TenantStateRow } from './platform.logic';

/**
 * `platform-alerts.json` in the queue home: each urgent alert key with when it was first
 * raised (ISO) and whether its notice went out
 */
export const PlatformAlertsSchema = z.record(
  z.string(),
  z.object({ at: z.string(), sent: z.boolean() })
);

export type PlatformAlerts = z.infer<typeof PlatformAlertsSchema>;

/** One urgent notice to send, for the alert it names */
export type AlertNotice = { key: string; text: string };

/** The kinds that raise an urgent notice */
const URGENT_KINDS: readonly Problem['kind'][] = ['down', 'new-issue'];

const urgent = (problem: Problem): boolean =>
  URGENT_KINDS.includes(problem.kind);

/** A row as the platform step wrote it, parsed the way the desk reads it */
export const parseRows = (rows: readonly TenantStateRow[]): TenantRow[] =>
  rows.map((r) =>
    parseTenantRow({
      key: r.key,
      at: r.at,
      name: r.name ?? null,
      deployment: r.deployment ?? null,
      status: r.status ?? null,
      apps: r.apps,
      domains: r.domains,
      switches: r.switches,
      db: r.db,
      sentry: r.sentry,
      visitors: r.visitors,
      deploy: r.deploy,
      backup: r.backup,
      errors: r.errors
    })
  );

/** The urgent problems of the rows just built */
export const urgentProblems = (
  rows: readonly TenantRow[],
  now: number
): Problem[] =>
  allProblems(
    rows.map((row) => ({ row })),
    now
  ).filter(urgent);

/** A per-row new-issue key, `<row>:new-issue:<shortId>` */
const ROW_NEW_ISSUE = /^[^:]+:new-issue:(.+)$/;

/** The alert a problem belongs to: a new issue is one alert across rows, a `down` one per row */
const alertKey = (problem: Problem): string => {
  if (problem.kind !== 'new-issue') return problem.key;
  const id = problem.ref?.shortId ?? ROW_NEW_ISSUE.exec(problem.key)?.[1];
  return id === undefined ? problem.key : `new-issue:${id}`;
};

/** "a", "a and b", "a, b and c" */
const joinNames = (names: readonly string[]): string =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The rows of a group by key, the shared row last and written as the host apps */
const whereText = (group: readonly Problem[]): string => {
  const rows = [...new Set(group.map((p) => p.row))].sort();
  const names = rows.filter((r) => r !== SHARED_KEY);
  if (rows.includes(SHARED_KEY)) names.push('the host apps');
  return joinNames(names);
};

const noticeText = (group: readonly Problem[]): string => {
  const problem = group[0];
  if (!problem) return '';
  if (problem.kind === 'new-issue' && problem.ref) {
    return `Platform: new Sentry issue on production in ${whereText(group)} · ${problem.ref.shortId} · ${problem.ref.level} ${problem.ref.url}`;
  }
  return `Platform: ${problem.title} · ${problem.evidence[0] ?? problem.kind}`;
};

/** Folds the older per-row new-issue keys into one key per issue: sent if any was, the earliest `at` */
const normalise = (previous: PlatformAlerts): PlatformAlerts => {
  const out: PlatformAlerts = {};
  for (const [key, entry] of Object.entries(previous)) {
    const id = ROW_NEW_ISSUE.exec(key)?.[1];
    const target = id === undefined ? key : `new-issue:${id}`;
    const seen = out[target];
    out[target] = seen
      ? {
          at: seen.at <= entry.at ? seen.at : entry.at,
          sent: seen.sent || entry.sent
        }
      : entry;
  }
  return out;
};

/**
 * Whether a row's fresh issues were not read: the whole Sentry read or its new-issue read
 * failed. A failed top-issue read leaves them read
 */
const freshUnread = (row: TenantRow): boolean =>
  (row.errors['sentry'] ?? '')
    .split('; ')
    .some((part) => part !== '' && !part.startsWith('top issue: '));

/**
 * Whether the read behind an alert key failed this tick, so its absence says nothing. A
 * new issue is kept while any row's fresh-issue read failed, or the tenants were not read. A
 * `down` key follows its row: a missing row counts as failed unless the tenants were read,
 * else a `fly` error on it.
 */
const sourceFailed = (
  key: string,
  rows: readonly TenantRow[],
  tenantsRead: boolean,
  freshFailed: boolean
): boolean => {
  if (key.startsWith('new-issue:')) return !tenantsRead || freshFailed;
  const row = rows.find((r) => key.startsWith(`${r.key}:`));
  if (!row) return !tenantsRead;
  if (key.startsWith(`${row.key}:down:`))
    return row.errors['fly'] !== undefined;
  return false;
};

/**
 * What a tick raises and what it remembers, one alert per `down` problem and one per new
 * Sentry issue across rows (older per-row new-issue keys in `previous` are folded in
 * first). A `new-issue` alert gets its notice the first tick it is raised; a `down` one
 * only when raised on two consecutive ticks, so one failed health check is not a notice. An
 * alert whose notice did not go (`sent` false) is tried again. `next` holds the notice keys
 * as not yet sent; the caller marks each sent. An alert raised before and not now is
 * dropped, unless the read behind it failed this tick, when it is kept so its return is not
 * a second notice. With no `previous` (the first tick) every alert is seeded as sent and
 * nothing is sent. `at` is the ISO time of this tick; `tenantsRead` is whether the tenants
 * were read.
 */
export const alertsToRaise = (
  previousRaw: PlatformAlerts | null,
  problems: readonly Problem[],
  rows: readonly TenantRow[],
  at: string,
  tenantsRead: boolean
): { notices: AlertNotice[]; next: PlatformAlerts } => {
  const previous = previousRaw === null ? null : normalise(previousRaw);
  const groups = new Map<string, Problem[]>();
  for (const problem of problems) {
    const key = alertKey(problem);
    const group = groups.get(key);
    if (group) group.push(problem);
    else groups.set(key, [problem]);
  }
  const next: PlatformAlerts = {};
  const notices: AlertNotice[] = [];
  for (const [key, group] of groups) {
    if (previous === null) {
      next[key] = { at, sent: true };
      continue;
    }
    const before = previous[key];
    if (before?.sent) {
      next[key] = before;
      continue;
    }
    next[key] = before ?? { at, sent: false };
    const due = group[0]?.kind === 'down' ? before !== undefined : true;
    if (due) notices.push({ key, text: noticeText(group) });
  }
  if (previous !== null) {
    const freshFailed = rows.some(freshUnread);
    for (const [key, entry] of Object.entries(previous)) {
      if (!(key in next) && sourceFailed(key, rows, tenantsRead, freshFailed))
        next[key] = entry;
    }
  }
  return { notices, next };
};
