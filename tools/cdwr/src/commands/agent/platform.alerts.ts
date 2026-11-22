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
 * `platform-alerts.json` in the queue home: each urgent problem key with when it was first
 * raised (ISO) and whether its notice went out
 */
export const PlatformAlertsSchema = z.record(
  z.string(),
  z.object({ at: z.string(), sent: z.boolean() })
);

export type PlatformAlerts = z.infer<typeof PlatformAlertsSchema>;

/** One urgent notice to send, for the problem it names */
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

const noticeText = (problem: Problem): string => {
  if (problem.kind === 'new-issue' && problem.ref) {
    const where = problem.row === SHARED_KEY ? 'the host apps' : problem.row;
    return `Platform: new Sentry issue on production in ${where} · ${problem.ref.shortId} · ${problem.ref.level} ${problem.ref.url}`;
  }
  return `Platform: ${problem.title} · ${problem.evidence[0] ?? problem.kind}`;
};

/**
 * Whether the read behind a problem key failed this tick, so its absence says nothing. A
 * row that is missing counts as failed unless the tenants were read.
 */
const sourceFailed = (
  key: string,
  rows: readonly TenantRow[],
  tenantsRead: boolean
): boolean => {
  const row = rows.find((r) => key.startsWith(`${r.key}:`));
  if (!row) return !tenantsRead;
  if (key.startsWith(`${row.key}:down:`))
    return row.errors['fly'] !== undefined;
  if (key.startsWith(`${row.key}:new-issue:`)) return row.sentry?.fresh == null;
  return false;
};

/**
 * What a tick raises and what it remembers. A `new-issue` key gets its notice the first
 * tick it is raised; a `down` key only when raised on two consecutive ticks, so one failed
 * health check is not a notice. A key whose notice did not go (`sent` false) is tried again.
 * `next` holds the notice keys as not yet sent; the caller marks each sent. A key raised
 * before and not now is dropped, unless the read behind it failed this tick, when it is
 * kept so its return is not a second notice. With no `previous` (the first tick) every
 * urgent key is seeded as sent and nothing is sent. `at` is the ISO time of this tick;
 * `tenantsRead` is whether the tenants were read.
 */
export const alertsToRaise = (
  previous: PlatformAlerts | null,
  problems: readonly Problem[],
  rows: readonly TenantRow[],
  at: string,
  tenantsRead: boolean
): { notices: AlertNotice[]; next: PlatformAlerts } => {
  const next: PlatformAlerts = {};
  const notices: AlertNotice[] = [];
  for (const problem of problems) {
    if (previous === null) {
      next[problem.key] = { at, sent: true };
      continue;
    }
    const before = previous[problem.key];
    if (before?.sent) {
      next[problem.key] = before;
      continue;
    }
    next[problem.key] = before ?? { at, sent: false };
    const due = problem.kind === 'down' ? before !== undefined : true;
    if (due) notices.push({ key: problem.key, text: noticeText(problem) });
  }
  if (previous !== null) {
    for (const [key, entry] of Object.entries(previous)) {
      if (!(key in next) && sourceFailed(key, rows, tenantsRead))
        next[key] = entry;
    }
  }
  return { notices, next };
};
