import type {
  GithubEventRow,
  HostMetricRow,
  RunsPayload,
  SessionRow
} from '../supabase';

import {
  CONNECT_GRACE_MS,
  HOST_METRICS_MINUTES,
  HOST_SPACING_SAMPLES,
  HOST_STALE_SAMPLES,
  LINEAR_STALE_MIN,
  SESSION_ATTENDED_MIN,
  SESSION_HANDBACK_MIN
} from './constants';
import type { Connection } from './state';
import type { ViewIssue } from './types';

// What the desk derives from the live tables: PR states, sessions per host, the pulse, problems and health.

/** A PR's state as `github_events` names it; the newest event wins */
export type PrStateName =
  | 'checks running'
  | 'checks passed'
  | 'checks failed'
  | 'checks finished'
  | 'Copilot reviewed'
  | 'reviewed'
  | 'review requested'
  | 'in merge queue'
  | 'left merge queue'
  | 'merged'
  | 'closed';

const PASSED = ['success', 'neutral', 'skipped'];
const FAILED = ['failure', 'timed_out', 'action_required', 'startup_failure'];

/** The state an action names; null for one the desk does not know */
export const prState = (action: string): PrStateName | null => {
  const [event, outcome = ''] = action.split(':');
  if (event === 'pull_request') {
    if (
      ['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(
        outcome
      )
    )
      return 'checks running';
    if (outcome === 'review_requested') return 'review requested';
    if (outcome === 'enqueued') return 'in merge queue';
    if (outcome === 'dequeued') return 'left merge queue';
    if (outcome === 'merged') return 'merged';
    if (outcome === 'closed') return 'closed';
    return null;
  }
  if (event === 'check_suite') {
    if (!outcome) return null;
    // A suite stored before the webhook kept its conclusion
    if (outcome === 'completed') return 'checks finished';
    if (PASSED.includes(outcome)) return 'checks passed';
    // A cancelled or stale suite (the merge queue supersedes them) failed nothing
    return FAILED.includes(outcome) ? 'checks failed' : 'checks finished';
  }
  if (event === 'pull_request_review')
    return outcome === 'copilot' ? 'Copilot reviewed' : 'reviewed';
  if (event === 'pull_request_review_comment') return 'reviewed';
  return null;
};

export type AgentPr = {
  pr: number;
  ticket: string;
  /** From the Linear poll; `github_events` has no title */
  title: string;
  state: PrStateName | null;
  action: string;
  /** When the newest event landed, in ms */
  at: number;
};

/** The agent's PRs that GitHub has told about, newest event first; a PR no ticket names is left out */
export const agentPrs = (
  events: readonly GithubEventRow[] | null,
  tickets: ReadonlyMap<number, string>,
  title: (ticket: string) => string
): AgentPr[] =>
  (events ?? [])
    .flatMap((e) => {
      const ticket = e.pr === null ? undefined : tickets.get(e.pr);
      if (e.pr === null || !ticket) return [];
      return [
        {
          pr: e.pr,
          ticket,
          title: title(ticket),
          state: prState(e.action),
          action: e.action,
          at: Date.parse(e.updated_at)
        }
      ];
    })
    .sort((a, b) => b.at - a.at);

const median = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Minutes between the host's samples, the median of its newest spacings; HOST_METRICS_MINUTES without two samples */
export const sampleMinutes = (series: readonly HostMetricRow[]): number => {
  const times = series
    .map((r) => Date.parse(r.at))
    .sort((a, b) => a - b)
    .slice(-(HOST_SPACING_SAMPLES + 1));
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 6e4);
  const m = median(gaps.filter((g) => g > 0));
  return m ?? HOST_METRICS_MINUTES;
};

/** Minutes after which a host that samples every `interval` minutes reads as silent */
export const silentAfter = (interval: number): number =>
  HOST_STALE_SAMPLES * interval;

export type LiveSession = {
  id: string;
  kind: string;
  /** Minutes since its last heartbeat */
  ageMin: number;
};

export type HostSessions = {
  host: string;
  sessions: LiveSession[];
  /** Minutes since the host's newest heartbeat of any session */
  ageMin: number;
};

const ageOf = (iso: string, now: Date): number =>
  (now.getTime() - Date.parse(iso)) / 6e4;

/** Sessions seen within `maxAgeMin` (SESSION_HANDBACK_MIN, the live ones), per host, newest host first; an ended session is gone at once */
export const hostSessions = (
  rows: readonly SessionRow[] | null,
  now: Date,
  maxAgeMin = SESSION_HANDBACK_MIN
): HostSessions[] => {
  const hosts = new Map<string, HostSessions>();
  for (const r of rows ?? []) {
    if (r.state === 'ended') continue;
    const ageMin = ageOf(r.last_seen, now);
    if (ageMin > maxAgeMin) continue;
    const h = hosts.get(r.host) ?? { host: r.host, sessions: [], ageMin };
    h.sessions.push({ id: r.id, kind: r.kind, ageMin });
    h.ageMin = Math.min(h.ageMin, ageMin);
    hosts.set(r.host, h);
  }
  for (const h of hosts.values())
    h.sessions.sort((a, b) => a.ageMin - b.ageMin);
  return [...hosts.values()].sort((a, b) => a.ageMin - b.ageMin);
};

export type HandBackState =
  'attended' | 'handing back' | 'heartbeat ok' | 'idle';

export type HandBack = {
  state: HandBackState;
  /** The attended host; null when none has an attended session */
  host: string | null;
  /** Minutes since that host's newest attended heartbeat */
  ageMin: number | null;
};

/**
 * The Mac's hand-back, from `sessions` alone: its newest attended heartbeat within
 * SESSION_ATTENDED_MIN is attended, within SESSION_HANDBACK_MIN handing back; after
 * that the NUC's heartbeat decides between heartbeat ok and idle. The Mac is any
 * host but the NUC, which is the host that sends samples, or without samples the
 * host that launches implementing sessions.
 */
export const handBack = (
  rows: readonly SessionRow[] | null,
  nucHost: string | null,
  nucFresh: boolean,
  now: Date
): HandBack => {
  const nuc =
    nucHost ?? (rows ?? []).find((r) => r.kind === 'implement')?.host ?? null;
  const attended = (rows ?? [])
    .filter(
      (r) => r.kind === 'attended' && r.host !== nuc && r.state !== 'ended'
    )
    .reduce<SessionRow | null>(
      (a, b) =>
        a && Date.parse(a.last_seen) >= Date.parse(b.last_seen) ? a : b,
      null
    );
  const ageMin = attended ? ageOf(attended.last_seen, now) : null;
  const host = attended?.host ?? null;
  if (ageMin !== null && ageMin <= SESSION_ATTENDED_MIN)
    return { state: 'attended', host, ageMin };
  if (ageMin !== null && ageMin <= SESSION_HANDBACK_MIN)
    return { state: 'handing back', host, ageMin };
  return { state: nucFresh ? 'heartbeat ok' : 'idle', host, ageMin };
};

export type Pulse = {
  /** `#719` for a PR, the ticket id for an issue */
  subject: string;
  /** The PR's state, else the raw action */
  what: string;
  /** In ms */
  at: number;
};

/** The newest event of each live table, newest first; empty before any */
export const feed = (
  events: readonly GithubEventRow[] | null,
  connection: Connection
): Pulse[] => {
  const github = (events ?? []).reduce<GithubEventRow | null>(
    (a, b) =>
      a && Date.parse(a.updated_at) >= Date.parse(b.updated_at) ? a : b,
    null
  );
  const fromGithub: Pulse | null = github
    ? {
        subject: github.pr === null ? github.subject : `#${github.pr}`,
        what: prState(github.action) ?? github.action,
        at: Date.parse(github.updated_at)
      }
    : null;
  const issue = connection.lastIssue;
  const fromIssue: Pulse | null =
    issue && issue.updated_at
      ? {
          subject: issue.identifier ?? issue.issue_id,
          what: issue.action,
          at: Date.parse(issue.updated_at)
        }
      : null;
  return [fromGithub, fromIssue]
    .filter((p): p is Pulse => p !== null)
    .sort((a, b) => b.at - a.at);
};

/** The newest event either live table brought; null before any */
export const pulse = (
  events: readonly GithubEventRow[] | null,
  connection: Connection
): Pulse | null => feed(events, connection)[0] ?? null;

/** What the desk can see is wrong with what it shows; `since` is when it began, in ms */
export type Problem =
  | {
      kind: 'connection';
      text: string;
      since: number;
      retries: number;
      status: Connection['status'];
      nextAt: number | null;
    }
  | {
      kind: 'data';
      reason: 'parse';
      text: string;
      since: number;
      /** When the kept view was written; null without one */
      goodAt: number | null;
      /** When the newest bad row was written */
      rowAt: number;
      view: unknown;
      issues: ViewIssue[];
    }
  | {
      kind: 'data';
      reason: 'stale';
      text: string;
      since: number;
      newestRun: number;
    }
  | {
      kind: 'unknown';
      text: string;
      since: number;
      host: string;
      ticket: string | null;
      silentMin: number;
      /** When the ticket's open run started, in ms */
      started: number | null;
    };

export type ProblemKind = Problem['kind'];

export type ProblemKey = 'connection' | 'unknown' | 'data-parse' | 'data-stale';

/** The card a problem gets: its kind, and for data its reason */
export const problemKey = (p: Problem): ProblemKey => {
  switch (p.kind) {
    case 'connection':
    case 'unknown':
      return p.kind;
    case 'data':
      return p.reason === 'parse' ? 'data-parse' : 'data-stale';
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
};

/** The earliest `since` of the problems that freeze numbers (data, unknown); a down channel only lags, so null without those */
export const frozenAt = (list: readonly Problem[]): number | null => {
  const times = list.filter((p) => p.kind !== 'connection').map((p) => p.since);
  return times.length ? Math.min(...times) : null;
};

/** What the desk can see is wrong with what it shows */
export const problems = ({
  connection,
  runs,
  runMinutes,
  host,
  sessions,
  now
}: {
  connection: Connection;
  runs: RunsPayload | null;
  runMinutes: number;
  /** The session rows, to tell whose session the snapshot calls alive; null before they load */
  sessions: readonly SessionRow[] | null;
  /** The NUC's newest sample (ms) and age, and its silent threshold; null without samples */
  host: {
    host: string;
    at: number;
    ageMin: number;
    silentMin: number;
  } | null;
  now: Date;
}): Problem[] => {
  const out: Problem[] = [];
  const nowMs = now.getTime();
  const past =
    connection.retries > 0 ||
    (connection.downSince !== null &&
      nowMs - connection.downSince >= CONNECT_GRACE_MS);
  if (!connection.live && past)
    out.push({
      kind: 'connection',
      text: connection.retries
        ? `Realtime is down (dropped ${connection.retries}×); polling every 5 min`
        : 'Realtime is not connected; polling every 5 min',
      since: connection.downSince ?? nowMs,
      retries: connection.retries,
      status: connection.status,
      nextAt: connection.nextAt
    });
  if (runs?.viewInvalid) {
    const goodAt = runs.qv?.at ? Date.parse(runs.qv.at) : null;
    out.push({
      kind: 'data',
      reason: 'parse',
      text: 'The queue_state row does not parse; showing the last good snapshot',
      since: goodAt ?? Date.parse(runs.at),
      goodAt,
      rowAt: Date.parse(runs.at),
      view: runs.view,
      issues: runs.viewIssues
    });
  }
  const newestRun = Math.max(
    0,
    ...(runs?.rows ?? []).map((r) => Date.parse(r.started))
  );
  if (runs?.at && newestRun - Date.parse(runs.at) > 2 * runMinutes * 6e4)
    out.push({
      kind: 'data',
      reason: 'stale',
      text: 'The queue_state row is older than the newest run',
      since: Date.parse(runs.at),
      newestRun
    });
  // A session on another host (the attended Mac) says nothing about the NUC's silence
  const sessionId = runs?.qv?.session.id;
  const sessionHost = sessionId
    ? (sessions ?? []).find((r) => r.id === sessionId)?.host
    : undefined;
  // A runs row is written only when the run ends, so the open work is the session the snapshot calls alive
  if (
    runs?.qv?.session.state === 'alive' &&
    host &&
    host.ageMin > host.silentMin &&
    (sessionHost === undefined || sessionHost === host.host)
  ) {
    const ticket = runs.qv.session.ticket ?? null;
    const open = ticket
      ? runs.rows.find((r) => r.ticket === ticket && r.finished === null)
      : undefined;
    out.push({
      kind: 'unknown',
      text: 'A session is alive while the NUC is silent; its state is unknown',
      since: host.at,
      host: host.host,
      ticket,
      silentMin: host.silentMin,
      started: open ? Date.parse(open.started) : null
    });
  }
  return out;
};

export type HealthCheck = {
  name: string;
  ok: boolean;
  /** When it was last true or last seen, in ms; null when never */
  at: number | null;
};

/** The Platform view's checks, in the order it lists them */
export const health = ({
  connection,
  runs,
  staleHours,
  nuc,
  sessions,
  events,
  storedAt,
  now
}: {
  connection: Connection;
  runs: RunsPayload | null;
  staleHours: number;
  /** The NUC's newest sample and its silent threshold; null without samples */
  nuc: { host: string; at: number; silentMin: number } | null;
  /** Every host seen in the last 24 hours, so a silent one fails rather than drops out */
  sessions: readonly HostSessions[];
  events: readonly GithubEventRow[] | null;
  storedAt: number | null;
  now: Date;
}): HealthCheck[] => {
  const nowMs = now.getTime();
  const snapshot = runs?.at ? Date.parse(runs.at) : null;
  const newestEvent = (events ?? []).reduce<number | null>(
    (a, e) => Math.max(a ?? 0, Date.parse(e.updated_at)),
    null
  );
  return [
    {
      name: 'Realtime',
      ok: connection.live,
      at: connection.upSince
    },
    {
      name: 'queue_state parses',
      ok: runs !== null && !runs.viewInvalid,
      at: snapshot
    },
    {
      name: 'Snapshot age',
      ok: snapshot !== null && nowMs - snapshot <= staleHours * 36e5,
      at: snapshot
    },
    ...(nuc
      ? [
          {
            name: `${nuc.host} heartbeat`,
            ok: (nowMs - nuc.at) / 6e4 <= nuc.silentMin,
            at: nuc.at
          }
        ]
      : []),
    ...sessions
      .filter((s) => s.host !== nuc?.host)
      .map((s) => ({
        name: `${s.host} heartbeat`,
        ok: s.ageMin <= SESSION_HANDBACK_MIN,
        at: nowMs - s.ageMin * 6e4
      })),
    {
      name: 'github_events last event',
      ok: newestEvent !== null,
      at: newestEvent
    },
    {
      name: 'Linear poll',
      ok: storedAt !== null && (nowMs - storedAt) / 6e4 <= LINEAR_STALE_MIN,
      at: storedAt
    }
  ];
};
