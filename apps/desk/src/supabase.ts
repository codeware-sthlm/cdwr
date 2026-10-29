import { createClient } from '@supabase/supabase-js';

import { DAY_MS } from './desk/format';
import {
  parseAttended,
  parseJob,
  parseSuggested,
  validateQueueView
} from './desk/parsers';
import type { Attended, Job, QueueView, Suggested } from './desk/types';
import type { Database } from './supabase.types';

type Tables = Database['public']['Tables'];
export type QueueStateRow = Tables['queue_state']['Row'];
export type RunRow = Tables['runs']['Row'];
export type UsageRow = Tables['usage']['Row'];
export type ActivityRow = Tables['activity']['Row'];
export type IssueEventRow = Tables['issue_events']['Row'];
export type HostMetricRow = Tables['host_metrics']['Row'];

export type SupabaseErrorCode = 'unauthorized' | 'network' | 'bad_response';

export class SupabaseError extends Error {
  readonly code: SupabaseErrorCode;

  constructor(code: SupabaseErrorCode, message: string) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

const WINDOW_DAYS = 30;
const RUNS_LIMIT = 500;
const ACTIVITY_LIMIT = 300;
const DEBOUNCE_MS = 500;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
type Role = 'planning' | 'orchestrating' | 'implementing';

export type RunsPayload = {
  last: { when: string; outcome: string } | null;
  attended: Attended | null;
  suggested: Suggested | null;
  job: Job | null;
  qv: QueueView | null;
  rows: { when: string; outcome: string; ticket: string; detail: string }[];
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

// The text's clock time is the scheduler host's local time; the row's `at` carries the zone
const LAST_RUN = /^\d{4}-\d\d-\d\d \d\d:\d\d\s*·\s*(.+)$/;

export const toRuns = (
  queueStates: QueueStateRow[],
  runRows: RunRow[]
): RunsPayload | null => {
  const state = newest(queueStates);
  if (!state) return null;
  const lastMatch = state.last_run?.match(LAST_RUN);
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
    qv: validateQueueView(state.view),
    // Idle adds no row
    rows: runRows
      .filter((r) => r.outcome !== 'idle')
      .sort((a, b) => byTimeDesc(a.started_at, b.started_at))
      .map((r) => ({
        when: localStamp(r.started_at),
        outcome: r.outcome,
        ticket: r.ticket ?? '',
        detail: r.detail ?? ''
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
  fetchPage: (from: number, to: number) => PromiseLike<T[]>
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
    `The usage read needs more than ${MAX_PAGES} pages`
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

export type SupabaseConfig = { url: string; anonKey: string };

type Failure = { message: string; code?: string; status: number };

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

  const read = (): Promise<QueuePayloads> =>
    attempt(async () => {
      const now = new Date();
      const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
      const [states, runs, usageRows, activity] = await Promise.all([
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
          .limit(ACTIVITY_LIMIT)
      ]);
      const queueStates = settle(states);
      return {
        runs: toRuns(queueStates, settle(runs)),
        usage: toUsage(usageRows, now),
        activity: toActivity(settle(activity), newest(queueStates)?.at ?? null)
      };
    });

  // Apart from `read`, so a host_metrics failure (a migration not yet applied) leaves the other tiles alone
  const readHostMetrics = (): Promise<HostMetricRow[]> =>
    attempt(async () =>
      settle(
        await client
          .from('host_metrics')
          .select('*')
          .gte('at', new Date(Date.now() - DAY_MS).toISOString())
          .order('at', { ascending: true })
      )
    );

  /**
   * `onChange` fires on a change and again each time the channel (re)joins, to
   * catch up on what was missed. `onStatus` gets false on a channel error, a
   * timeout or a close, and true on (re)joining. `onIssue` gets each
   * `issue_events` row as it arrives, without debounce. `onHostMetrics` fires
   * (debounced) on a new `host_metrics` row, which `onChange` does not.
   */
  const subscribe = (
    onChange: () => void,
    onStatus?: (healthy: boolean) => void,
    onIssue?: (row: IssueEventRow) => void,
    onHostMetrics?: () => void
  ): (() => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hostTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = (): void => {
      clearTimeout(timer);
      timer = setTimeout(onChange, DEBOUNCE_MS);
    };
    const hostChanged = (): void => {
      clearTimeout(hostTimer);
      hostTimer = setTimeout(() => onHostMetrics?.(), DEBOUNCE_MS);
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
    channel = channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'host_metrics' },
      hostChanged
    );
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table: 'issue_events' },
        (payload) => {
          const row = toIssueEvent(payload.new);
          if (row) onIssue?.(row);
        }
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatus?.(true);
        onChange();
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        onStatus?.(false);
      }
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(hostTimer);
      void client.removeChannel(channel);
    };
  };

  const check = (): Promise<void> =>
    attempt(async () => {
      settle(await client.from('queue_state').select('host').limit(1));
    });

  return { read, readHostMetrics, subscribe, check };
};
