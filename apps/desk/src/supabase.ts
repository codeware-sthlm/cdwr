import { createClient } from '@supabase/supabase-js';

import { QUEUE_WRITER_MIN } from './desk/constants';
import { DAY_MS } from './desk/format';
import {
  parseAttended,
  parseJob,
  parseReviewRow,
  parseSuggested,
  queueViewIssues,
  validateQueueView
} from './desk/parsers';
import type {
  Attended,
  Job,
  QueueView,
  ReviewRecord,
  Suggested,
  ViewIssue
} from './desk/types';
import type { Database } from './supabase.types';

type Tables = Database['public']['Tables'];
export type QueueStateRow = Tables['queue_state']['Row'];
export type RunRow = Tables['runs']['Row'];
export type UsageRow = Tables['usage']['Row'];
export type ActivityRow = Tables['activity']['Row'];
export type IssueEventRow = Tables['issue_events']['Row'];
export type HostMetricRow = Tables['host_metrics']['Row'];
export type BuildRow = Tables['builds']['Row'];
export type PlanUsageRow = Tables['plan_usage']['Row'];
export type UsageHourRow = Tables['usage_hours']['Row'];
export type GithubEventRow = Tables['github_events']['Row'];
export type SessionRow = Tables['sessions']['Row'];
export type DeskCommandRow = Tables['desk_commands']['Row'];
export type SnoozeRow = Tables['snoozes']['Row'];
export type DismissalRow = Tables['review_dismissals']['Row'];

/** Full commits of main's newest successful builds; null when none is recorded */
/** Main's newest build of the NUC image, the Mac desk (desk.yml) and the web desk (desk-image.yml) */
export type MainBuilds = {
  image: string | null;
  desk: string | null;
  deskWeb: string | null;
};

export type SupabaseErrorCode = 'unauthorized' | 'network' | 'bad_response';

export class SupabaseError extends Error {
  readonly code: SupabaseErrorCode;

  constructor(code: SupabaseErrorCode, message: string) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

/** What the Realtime channel reports once it has been asked to join */
export type ChannelStatus =
  'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

const WINDOW_DAYS = 30;
const RUNS_LIMIT = 500;
const ACTIVITY_LIMIT = 300;
export const GITHUB_EVENTS_LIMIT = 200;
const DEBOUNCE_MS = 500;
const PAGE_SIZE = 1000;
/** The newest applied abandons read past the 24 h window */
const ABANDONS_LIMIT = 20;
const MAX_PAGES = 20;
type Role = 'planning' | 'orchestrating' | 'implementing';

export type RunsPayload = {
  last: { when: string; outcome: string } | null;
  attended: Attended | null;
  suggested: Suggested | null;
  job: Job | null;
  qv: QueueView | null;
  /** The row carries a view that does not parse; `qv` is then null, or the last good one the page kept */
  viewInvalid: boolean;
  /** The row's view as stored, whether or not it parses */
  view: unknown;
  /** The paths that fail to parse; empty unless `viewInvalid` */
  viewIssues: ViewIssue[];
  /** When the picked queue_state row was written, ISO */
  at: string;
  /** The host that wrote the picked row */
  host: string;
  /** The other hosts that wrote a row within QUEUE_WRITER_MIN */
  others: { host: string; at: string; paused: boolean }[];
  /** The watch.json of every host that wrote a row within QUEUE_WRITER_MIN, as stored; the model parses it */
  watches: { host: string; at: string; watch: unknown }[];
  main: MainBuilds;
  rows: {
    when: string;
    outcome: string;
    ticket: string;
    detail: string;
    /** ISO; `finished` is null while the run is open */
    started: string;
    finished: string | null;
  }[];
};

type RoleCosts = Record<Role, number>;

export type UsagePayload = {
  updated: string;
  windowDays: number;
  total: number;
  pricesDate: string;
  unpriced: string[];
  models: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
  }[];
  days: ({ day: string } & RoleCosts & { total: number })[];
  tickets: ({ ticket: string } & RoleCosts & {
      total: number;
      output: number;
      cacheRead: number;
    })[];
};

export type ActivityPayload = {
  updated: string;
  header: string;
  dropped: string;
  rows: { when: string; ticket: string; actor: string; change: string }[];
};

export type QueuePayloads = {
  runs: RunsPayload | null;
  usage: UsagePayload;
  activity: ActivityPayload | null;
};

export type Payloads = QueuePayloads & {
  /** The last 24 hours of the queue host's samples, oldest first */
  hostMetrics: HostMetricRow[];
  /** The plan samples of the last 8 days, whichever host wrote them */
  planUsage: PlanUsageRow[];
  /** The hourly usage rows of the last 8 days, every host and model */
  usageHours: UsageHourRow[];
  /** The newest 200 GitHub events, newest first */
  githubEvents: GithubEventRow[];
  /** The sessions seen in the last 24 hours, newest first */
  sessions: SessionRow[];
  /** The desk commands of the last 24 hours, oldest first */
  deskCommands: DeskCommandRow[];
  /** Every snoozed ticket, by ticket */
  snoozes: SnoozeRow[];
  /** The newest review; null when there is none or its row does not parse */
  reviews: ReviewRecord | null;
  /** Every dismissed finding, by finding id */
  dismissals: DismissalRow[];
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time */
export const localDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `YYYY-MM-DD HH:MM` in local time, the shape the page parses with `Date.parse(when.replace(' ', 'T'))` */
export const localStamp = (iso: string | Date): string => {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return `${localDay(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const cents = (n: number): number => Math.round(n * 100) / 100;

const byTimeDesc = (a: string, b: string): number =>
  Date.parse(b) - Date.parse(a);

const newest = (rows: QueueStateRow[]): QueueStateRow | undefined =>
  [...rows].sort((a, b) => byTimeDesc(a.at, b.at))[0];

/** A paused tick ends its last_run line in `· paused` and its job line carries a `· paused` segment */
export const isPausedRow = (
  row: Pick<QueueStateRow, 'last_run' | 'job'>
): boolean =>
  (row.last_run ?? '')
    .split('·')
    .map((s) => s.trim())
    .slice(1, 2)
    .includes('paused') || parseJob(row.job)?.paused === true;

const publishing = (row: QueueStateRow, now: Date): boolean =>
  now.getTime() - Date.parse(row.at) <= QUEUE_WRITER_MIN * 6e4;

/** The newest unpaused row written within QUEUE_WRITER_MIN, so neither a paused host nor a dead one hides the live host; else the newest of all */
export const pickQueueState = (
  rows: QueueStateRow[],
  now: Date
): QueueStateRow | undefined =>
  newest(rows.filter((r) => !isPausedRow(r) && publishing(r, now))) ??
  newest(rows);

// The text's clock time is the scheduler host's local time; the row's `at` carries the zone
const LAST_RUN = /^\d{4}-\d\d-\d\d \d\d:\d\d\s*·\s*(.+)$/;

export const toMain = (rows: BuildRow[]): MainBuilds => ({
  image: rows.find((r) => r.workflow === 'agent-host-image.yml')?.sha ?? null,
  desk: rows.find((r) => r.workflow === 'desk.yml')?.sha ?? null,
  deskWeb: rows.find((r) => r.workflow === 'desk-image.yml')?.sha ?? null
});

export const toRuns = (
  queueStates: QueueStateRow[],
  runRows: RunRow[],
  buildRows: BuildRow[] = [],
  now: Date = new Date()
): RunsPayload | null => {
  const state = pickQueueState(queueStates, now);
  if (!state) return null;
  const lastMatch = state.last_run?.match(LAST_RUN);
  const qv = validateQueueView(state.view);
  const viewInvalid = qv === null && state.view !== null;
  return {
    last: lastMatch
      ? { when: localStamp(state.at), outcome: lastMatch[1].trim() }
      : null,
    attended: state.attended
      ? parseAttended(`Attended: ${state.attended}`)
      : null,
    suggested: state.suggested
      ? parseSuggested(`Suggested: ${state.suggested}`)
      : null,
    // run.sh's job_line already starts with `Job: `; the other two lines are stored bare
    job: state.job ? parseJob(state.job) : null,
    qv,
    viewInvalid,
    view: state.view,
    viewIssues: viewInvalid ? queueViewIssues(state.view) : [],
    at: state.at,
    host: state.host,
    others: queueStates
      .filter((r) => r !== state && publishing(r, now))
      .sort((a, b) => byTimeDesc(a.at, b.at))
      .map((r) => ({ host: r.host, at: r.at, paused: isPausedRow(r) })),
    watches: queueStates
      .filter((r) => r.watch !== null && publishing(r, now))
      .map((r) => ({ host: r.host, at: r.at, watch: r.watch })),
    main: toMain(buildRows),
    // Idle adds no row
    rows: runRows
      .filter((r) => r.outcome !== 'idle')
      .sort((a, b) => byTimeDesc(a.started_at, b.started_at))
      .map((r) => ({
        when: localStamp(r.started_at),
        outcome: r.outcome,
        ticket: r.ticket ?? '',
        detail: r.detail ?? '',
        started: r.started_at,
        finished: r.finished_at ?? null
      }))
  };
};

const noCosts = (): RoleCosts => ({
  planning: 0,
  orchestrating: 0,
  implementing: 0
});

const rolledUp = <T extends { total: number } & RoleCosts>(row: T): T => ({
  ...row,
  planning: cents(row.planning),
  orchestrating: cents(row.orchestrating),
  implementing: cents(row.implementing),
  total: cents(row.total)
});

export const toUsage = (usageRows: UsageRow[], now: Date): UsagePayload => {
  const since = localDay(new Date(now.getTime() - WINDOW_DAYS * DAY_MS));
  const rows = usageRows.filter((r) => r.day >= since);

  const models = new Map<string, UsagePayload['models'][number]>();
  const days = new Map<string, UsagePayload['days'][number]>();
  const tickets = new Map<string, UsagePayload['tickets'][number]>();

  for (const r of rows) {
    // `input_tokens` already includes the cache reads and writes, and the page adds all four
    const input = r.input_tokens - r.cache_read_tokens - r.cache_write_tokens;

    const model = models.get(r.model) ?? {
      model: r.model,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0
    };
    model.input += input;
    model.output += r.output_tokens;
    model.cacheRead += r.cache_read_tokens;
    model.cacheWrite += r.cache_write_tokens;
    model.cost += r.cost_usd;
    models.set(r.model, model);

    const day = days.get(r.day) ?? { day: r.day, ...noCosts(), total: 0 };
    day[r.role] += r.cost_usd;
    day.total += r.cost_usd;
    days.set(r.day, day);

    const key = r.ticket ?? 'unattributed';
    const ticket = tickets.get(key) ?? {
      ticket: key,
      ...noCosts(),
      total: 0,
      output: 0,
      cacheRead: 0
    };
    ticket[r.role] += r.cost_usd;
    ticket.total += r.cost_usd;
    ticket.output += r.output_tokens;
    ticket.cacheRead += r.cache_read_tokens;
    tickets.set(key, ticket);
  }

  return {
    updated: localStamp(now),
    windowDays: WINDOW_DAYS,
    total: cents(rows.reduce((sum, r) => sum + r.cost_usd, 0)),
    pricesDate: '',
    unpriced: [],
    models: [...models.values()]
      .map((m) => ({ ...m, cost: cents(m.cost) }))
      .sort((a, b) => b.cost - a.cost || a.model.localeCompare(b.model)),
    days: [...days.values()]
      .map(rolledUp)
      .sort((a, b) => a.day.localeCompare(b.day)),
    // Most expensive first; unattributed last whatever it cost
    tickets: [...tickets.values()]
      .map(rolledUp)
      .sort(
        (a, b) =>
          Number(a.ticket === 'unattributed') -
            Number(b.ticket === 'unattributed') || b.total - a.total
      )
  };
};

export const toActivity = (
  activityRows: ActivityRow[],
  updatedAt: string | null
): ActivityPayload | null => {
  if (!updatedAt) return null;
  const updated = localStamp(updatedAt);
  return {
    updated,
    header: updated,
    dropped: '',
    rows: [...activityRows]
      .sort((a, b) => byTimeDesc(a.at, b.at))
      .map((r) => ({
        when: localStamp(r.at),
        ticket: r.ticket ?? '',
        actor: r.actor,
        change: r.change
      }))
  };
};

/**
 * Reads every row through pages of `PAGE_SIZE`, since PostgREST caps a reply
 * and truncates silently. Fails rather than return partial data.
 */
export const readAllPages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[]>,
  table = 'usage'
): Promise<T[]> => {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const chunk = await fetchPage(from, from + PAGE_SIZE - 1);
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
  throw new SupabaseError(
    'bad_response',
    `The ${table} read needs more than ${MAX_PAGES} pages`
  );
};

/** The row of a Realtime payload, or undefined when it is not an issue event. */
export const toIssueEvent = (row: unknown): IssueEventRow | undefined => {
  if (typeof row !== 'object' || row === null) return undefined;
  if (!('issue_id' in row) || typeof row.issue_id !== 'string')
    return undefined;
  return {
    issue_id: row.issue_id,
    identifier:
      'identifier' in row && typeof row.identifier === 'string'
        ? row.identifier
        : null,
    action: 'action' in row && typeof row.action === 'string' ? row.action : '',
    updated_at:
      'updated_at' in row && typeof row.updated_at === 'string'
        ? row.updated_at
        : ''
  };
};

/** The row of a Realtime payload, or undefined when it is not a GitHub event; the time orders the PRs, so it must parse */
export const toGithubEvent = (row: unknown): GithubEventRow | undefined => {
  if (typeof row !== 'object' || row === null) return undefined;
  if (!('subject' in row) || typeof row.subject !== 'string') return undefined;
  if (
    !('updated_at' in row) ||
    typeof row.updated_at !== 'string' ||
    Number.isNaN(Date.parse(row.updated_at))
  )
    return undefined;
  return {
    subject: row.subject,
    pr: 'pr' in row && typeof row.pr === 'number' ? row.pr : null,
    action: 'action' in row && typeof row.action === 'string' ? row.action : '',
    updated_at: row.updated_at
  };
};

export type SupabaseConfig = { url: string; anonKey: string };

type Failure = { message: string; code?: string; status: number };

/** PostgREST's "table not in the schema cache", and Postgres's "undefined table" */
const MISSING_TABLE = ['PGRST205', '42P01'];

const failure = ({ message, code, status }: Failure): SupabaseError => {
  if (status === 401 || status === 403 || code === 'PGRST301')
    return new SupabaseError('unauthorized', message);
  if (status === 0 || status >= 500)
    return new SupabaseError('network', message);
  return new SupabaseError('bad_response', message);
};

export const createSupabase = ({ url, anonKey }: SupabaseConfig) => {
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false }
  });

  const settle = <T>(result: {
    data: T | null;
    error: { message: string; code?: string } | null;
    status: number;
  }): T => {
    if (result.error)
      throw failure({
        message: result.error.message,
        code: result.error.code,
        status: result.status
      });
    if (result.data === null)
      throw new SupabaseError('bad_response', 'The reply had no rows');
    return result.data;
  };

  const attempt = async <T>(run: () => PromiseLike<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SupabaseError) throw error;
      throw new SupabaseError(
        'network',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  // The table is applied by hand after merge, so a missing one reads as no builds; any other error fails as usual
  const buildRows = (result: {
    data: BuildRow[] | null;
    error: { message: string; code?: string } | null;
    status: number;
  }): BuildRow[] =>
    result.error && MISSING_TABLE.includes(result.error.code ?? '')
      ? []
      : settle(result);

  const read = (): Promise<QueuePayloads> =>
    attempt(async () => {
      const now = new Date();
      const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
      const [states, runs, usageRows, activity, builds] = await Promise.all([
        client.from('queue_state').select('*'),
        client
          .from('runs')
          .select('*')
          .neq('outcome', 'idle')
          .gte('started_at', since.toISOString())
          .order('started_at', { ascending: false })
          .limit(RUNS_LIMIT),
        readAllPages(async (from, to) =>
          settle(
            await client
              .from('usage')
              .select('*')
              .gte('day', localDay(since))
              .order('id', { ascending: true })
              .range(from, to)
          )
        ),
        client
          .from('activity')
          .select('*')
          .order('at', { ascending: false })
          .limit(ACTIVITY_LIMIT),
        client.from('builds').select('*')
      ]);
      const queueStates = settle(states);
      const runsPayload = toRuns(
        queueStates,
        settle(runs),
        buildRows(builds),
        now
      );
      return {
        runs: runsPayload,
        usage: toUsage(usageRows, now),
        activity: toActivity(settle(activity), runsPayload?.at ?? null)
      };
    });

  // Apart from `read`, so a host_metrics failure (a migration not yet applied) leaves the other tiles alone
  // The last 24 h plus the newest sample whatever its age, so a long outage reads as stale rather than empty
  const readHostMetrics = (): Promise<HostMetricRow[]> =>
    attempt(async () => {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const [rows, newest] = await Promise.all([
        // A sample a minute is 1440 rows, past one page; ordered down to the key so a page boundary neither repeats nor skips one
        readAllPages(
          async (from, to) =>
            settle(
              await client
                .from('host_metrics')
                .select('*')
                .gte('at', since)
                .order('at', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to)
            ),
          'host_metrics'
        ),
        client
          .from('host_metrics')
          .select('*')
          .order('at', { ascending: false })
          .limit(1)
      ]);
      const older = settle(newest).filter(
        (r) => !rows.some((w) => w.id === r.id)
      );
      return [...older, ...rows];
    });

  // Apart from `read`, so a plan_usage failure (a migration not yet applied) leaves the other tiles alone
  const readPlanUsage = (): Promise<PlanUsageRow[]> =>
    attempt(() => {
      const since = new Date(Date.now() - 8 * DAY_MS).toISOString();
      // Ordered down to the key, so a page boundary inside equal samples neither repeats nor skips a row
      return readAllPages(async (from, to) =>
        settle(
          await client
            .from('plan_usage')
            .select('*')
            .gte('sampled_at', since)
            .order('sampled_at', { ascending: true })
            .order('kind', { ascending: true })
            .order('resets_at', { ascending: true })
            .order('used_percentage', { ascending: true })
            .range(from, to)
        )
      );
    });

  // Apart from `read`, so a usage_hours failure (a migration not yet applied) leaves the other tiles alone
  const readUsageHours = (): Promise<UsageHourRow[]> =>
    attempt(() => {
      const since = new Date(Date.now() - 8 * DAY_MS).toISOString();
      return readAllPages(async (from, to) =>
        settle(
          await client
            .from('usage_hours')
            .select('*')
            .gte('hour', since)
            .order('hour', { ascending: true })
            .order('host', { ascending: true })
            .order('model', { ascending: true })
            .order('role', { ascending: true })
            .range(from, to)
        )
      );
    });

  // Apart from `read`, so a github_events failure (a migration not yet applied) leaves the other tiles alone
  const readGithubEvents = (): Promise<GithubEventRow[]> =>
    attempt(async () =>
      settle(
        await client
          .from('github_events')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(GITHUB_EVENTS_LIMIT)
      )
    );

  // The table is never pruned, so only the last 24 h are read; paged by id, since heartbeats move last_seen between pages
  const readSessions = (): Promise<SessionRow[]> =>
    attempt(async () => {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const rows = await readAllPages(
        async (from, to) =>
          settle(
            await client
              .from('sessions')
              .select('*')
              .gte('last_seen', since)
              .order('id', { ascending: true })
              .range(from, to)
          ),
        'sessions'
      );
      return rows.sort(
        (a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen)
      );
    });

  // The table is applied by hand after merge, so a missing one reads as no commands; paged by id, like sessions.
  // The newest applied abandons come whatever their age: they end a session a long-silent host still names.
  const readDeskCommands = (): Promise<DeskCommandRow[]> =>
    attempt(async () => {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const orMissing = (result: {
        data: DeskCommandRow[] | null;
        error: { message: string; code?: string } | null;
        status: number;
      }): DeskCommandRow[] =>
        result.error && MISSING_TABLE.includes(result.error.code ?? '')
          ? []
          : settle(result);
      const [recent, abandons] = await Promise.all([
        readAllPages(
          async (from, to) =>
            orMissing(
              await client
                .from('desk_commands')
                .select('*')
                .gte('at', since)
                .order('id', { ascending: true })
                .range(from, to)
            ),
          'desk_commands'
        ),
        client
          .from('desk_commands')
          .select('*')
          .eq('kind', 'abandon')
          .eq('status', 'applied')
          .order('id', { ascending: false })
          .limit(ABANDONS_LIMIT)
          .then(orMissing)
      ]);
      const byId = new Map(
        [...abandons, ...recent].map((row) => [row.id, row])
      );
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });

  // The table is applied by hand after merge, so a missing one reads as no snoozes; a handful of rows, so no paging
  const readSnoozes = (): Promise<SnoozeRow[]> =>
    attempt(async () => {
      const result = await client
        .from('snoozes')
        .select('*')
        .order('ticket', { ascending: true });
      return result.error && MISSING_TABLE.includes(result.error.code ?? '')
        ? []
        : settle(result);
    });

  // The tables are applied by hand after merge, so a missing one reads as no review; a row that does not parse reads as none too
  const readReviews = (): Promise<ReviewRecord | null> =>
    attempt(async () => {
      const result = await client
        .from('reviews')
        .select('*')
        .order('at', { ascending: false })
        .limit(1);
      if (result.error && MISSING_TABLE.includes(result.error.code ?? ''))
        return null;
      const row = settle(result)[0];
      return row ? parseReviewRow(row) : null;
    });

  // A dismissal holds for 90 days, as the review run reads them; newest first
  const readDismissals = (): Promise<DismissalRow[]> =>
    attempt(async () => {
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const result = await client
        .from('review_dismissals')
        .select('*')
        .gte('at', since)
        .order('at', { ascending: false })
        .limit(1000);
      return result.error && MISSING_TABLE.includes(result.error.code ?? '')
        ? []
        : settle(result);
    });

  /**
   * `onChange` fires on a change and again each time the channel (re)joins, to
   * catch up on what was missed. `onStatus` gets false on a channel error, a
   * timeout or a close, and true on (re)joining, with the status behind it. `onIssue` gets each
   * `issue_events` row as it arrives, without debounce. `onHostMetrics` fires
   * (debounced) on a new `host_metrics` row, which `onChange` does not;
   * `onPlanUsage` on a new `plan_usage` row and `onUsageHours` on a new or
   * updated `usage_hours` row, likewise. `onGithub` gets each `github_events`
   * row as it arrives, without debounce; `onSessions` fires (debounced) on a
   * new or updated `sessions` row, which `onChange` hears too; `onDeskCommands`
   * fires (debounced) on a new or updated `desk_commands` row, and on each (re)join;
   * `onSnoozes` likewise on a new, updated or deleted `snoozes` row; `onReviews` on a new
   * `reviews` row and `onDismissals` on a new, updated or deleted `review_dismissals` row.
   */
  const subscribe = (
    onChange: () => void,
    onStatus?: (healthy: boolean, status: ChannelStatus) => void,
    onIssue?: (row: IssueEventRow) => void,
    onHostMetrics?: () => void,
    onPlanUsage?: () => void,
    onUsageHours?: () => void,
    onGithub?: (row: GithubEventRow) => void,
    onSessions?: () => void,
    onDeskCommands?: () => void,
    onSnoozes?: () => void,
    onReviews?: () => void,
    onDismissals?: () => void
  ): (() => Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hostTimer: ReturnType<typeof setTimeout> | undefined;
    let planTimer: ReturnType<typeof setTimeout> | undefined;
    let hoursTimer: ReturnType<typeof setTimeout> | undefined;
    let sessionsTimer: ReturnType<typeof setTimeout> | undefined;
    let commandsTimer: ReturnType<typeof setTimeout> | undefined;
    let snoozesTimer: ReturnType<typeof setTimeout> | undefined;
    let reviewsTimer: ReturnType<typeof setTimeout> | undefined;
    let dismissalsTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = (): void => {
      clearTimeout(timer);
      timer = setTimeout(onChange, DEBOUNCE_MS);
    };
    const hostChanged = (): void => {
      clearTimeout(hostTimer);
      hostTimer = setTimeout(() => onHostMetrics?.(), DEBOUNCE_MS);
    };
    const planChanged = (): void => {
      clearTimeout(planTimer);
      planTimer = setTimeout(() => onPlanUsage?.(), DEBOUNCE_MS);
    };
    const hoursChanged = (): void => {
      clearTimeout(hoursTimer);
      hoursTimer = setTimeout(() => onUsageHours?.(), DEBOUNCE_MS);
    };
    const sessionsChanged = (): void => {
      clearTimeout(sessionsTimer);
      sessionsTimer = setTimeout(() => onSessions?.(), DEBOUNCE_MS);
    };
    const commandsChanged = (): void => {
      clearTimeout(commandsTimer);
      commandsTimer = setTimeout(() => onDeskCommands?.(), DEBOUNCE_MS);
    };
    const snoozesChanged = (): void => {
      clearTimeout(snoozesTimer);
      snoozesTimer = setTimeout(() => onSnoozes?.(), DEBOUNCE_MS);
    };
    const reviewsChanged = (): void => {
      clearTimeout(reviewsTimer);
      reviewsTimer = setTimeout(() => onReviews?.(), DEBOUNCE_MS);
    };
    const dismissalsChanged = (): void => {
      clearTimeout(dismissalsTimer);
      dismissalsTimer = setTimeout(() => onDismissals?.(), DEBOUNCE_MS);
    };
    let channel = client.channel('desk');
    for (const table of [
      'queue_state',
      'runs',
      'usage',
      'activity',
      'sessions'
    ] as const) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel = channel.on(
          'postgres_changes',
          { event, schema: 'public', table },
          changed
        );
      }
    }
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table: 'issue_events' },
        (payload) => {
          const row = toIssueEvent(payload.new);
          if (row) onIssue?.(row);
        }
      );
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table: 'sessions' },
        sessionsChanged
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatus?.(true, status);
        onChange();
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        onStatus?.(false, status);
      }
    });
    // Its own channel too, so a github_events table missing from the publication costs the PR states only
    let github = client.channel('desk-github');
    for (const event of ['INSERT', 'UPDATE'] as const) {
      github = github.on(
        'postgres_changes',
        { event, schema: 'public', table: 'github_events' },
        (payload) => {
          const row = toGithubEvent(payload.new);
          if (row) onGithub?.(row);
        }
      );
    }
    github.subscribe();
    // Its own channel, so a missing host_metrics table fails only this one; the status is ignored
    const hostChannel = client
      .channel('desk-host')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'host_metrics' },
        hostChanged
      )
      .subscribe();
    // Its own channel, so that before the builds migration is applied a refused
    // subscription costs the badges only, never the desk's health or its other updates
    let builds = client.channel('desk-builds');
    for (const event of ['INSERT', 'UPDATE'] as const) {
      builds = builds.on(
        'postgres_changes',
        { event, schema: 'public', table: 'builds' },
        changed
      );
    }
    // A (re)join catches up on a build that landed while it was away
    builds.subscribe((status) => {
      if (status === 'SUBSCRIBED') changed();
    });
    // Its own channel, so before the desk_commands migration is applied a refused subscription costs the commands only
    let commands = client.channel('desk-commands');
    for (const event of ['INSERT', 'UPDATE'] as const) {
      commands = commands.on(
        'postgres_changes',
        { event, schema: 'public', table: 'desk_commands' },
        commandsChanged
      );
    }
    // A (re)join catches up on a command that changed while it was away
    commands.subscribe((status) => {
      if (status === 'SUBSCRIBED') commandsChanged();
    });
    // Its own channel too, so before the snoozes migration is applied a refused subscription costs the snoozes only
    let snoozes = client.channel('desk-snoozes');
    for (const event of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      snoozes = snoozes.on(
        'postgres_changes',
        { event, schema: 'public', table: 'snoozes' },
        snoozesChanged
      );
    }
    // A (re)join catches up on a snooze that changed while it was away
    snoozes.subscribe((status) => {
      if (status === 'SUBSCRIBED') snoozesChanged();
    });
    // Their own channels too, so before the reviews migration is applied a refused subscription costs the review only
    let reviews = client.channel('desk-reviews');
    for (const event of ['INSERT', 'UPDATE'] as const) {
      reviews = reviews.on(
        'postgres_changes',
        { event, schema: 'public', table: 'reviews' },
        reviewsChanged
      );
    }
    // A (re)join catches up on a review that landed while it was away
    reviews.subscribe((status) => {
      if (status === 'SUBSCRIBED') reviewsChanged();
    });
    let dismissals = client.channel('desk-dismissals');
    for (const event of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      dismissals = dismissals.on(
        'postgres_changes',
        { event, schema: 'public', table: 'review_dismissals' },
        dismissalsChanged
      );
    }
    dismissals.subscribe((status) => {
      if (status === 'SUBSCRIBED') dismissalsChanged();
    });
    // One channel per plan usage table too, so a missing one fails only its own data
    const planChannel = client
      .channel('desk-plan')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_usage' },
        planChanged
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plan_usage' },
        planChanged
      )
      .subscribe();
    const hoursChannel = client
      .channel('desk-hours')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'usage_hours' },
        hoursChanged
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'usage_hours' },
        hoursChanged
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      clearTimeout(hostTimer);
      clearTimeout(planTimer);
      clearTimeout(hoursTimer);
      clearTimeout(sessionsTimer);
      clearTimeout(commandsTimer);
      clearTimeout(snoozesTimer);
      clearTimeout(reviewsTimer);
      clearTimeout(dismissalsTimer);
      // Resolves once every channel is gone; a resubscribe before that gets the old one back
      return Promise.allSettled(
        [
          channel,
          github,
          hostChannel,
          builds,
          commands,
          snoozes,
          reviews,
          dismissals,
          planChannel,
          hoursChannel
        ].map((c) => client.removeChannel(c))
      ).then(() => undefined);
    };
  };

  const check = (): Promise<void> =>
    attempt(async () => {
      settle(await client.from('queue_state').select('host').limit(1));
    });

  return {
    read,
    readHostMetrics,
    readPlanUsage,
    readUsageHours,
    readGithubEvents,
    readSessions,
    readDeskCommands,
    readSnoozes,
    readReviews,
    readDismissals,
    subscribe,
    check
  };
};
