import {
  type Comment,
  IDEA_LABEL,
  type Issue,
  type IssueDetail,
  type Linear,
  LinearError,
  OPEN_STATES,
  type OpenStatusType
} from './linear';
import {
  type ChannelStatus,
  GITHUB_EVENTS_LIMIT,
  type GithubEventRow,
  type IssueEventRow,
  type Payloads,
  type QueuePayloads,
  SupabaseError,
  type createSupabase
} from './supabase';

const LINEAR = 'Linear';
const SUPABASE = 'Supabase';
export const REFRESH_MS = 5 * 60 * 1000;
export const ISSUE_COALESCE_MS = 500;
export const FOCUS_DEBOUNCE_MS = 10 * 1000;
export const BACKOFF_MS = [15 * 1000, 30 * 1000, 60 * 1000];

/** What each request answers with, by server and tool */
export type Requests = {
  [LINEAR]: {
    list_issues: { issues: Issue[] };
    get_issue: IssueDetail;
    list_comments: { comments: Comment[] };
  };
  [SUPABASE]: Payloads;
};

type Server = keyof Requests;
type Tool<S extends Server> = keyof Requests[S] & string;

export type DataFailure = { code: string; message: string };

export type DataResult<T = unknown> = {
  payload: T;
  cache: { storedAt: number };
};

export type WatchEvent<T = unknown> =
  | { type: 'data'; result: DataResult<T> }
  | { type: 'error'; error: DataFailure };

export type CallOptions = { cache?: { staleTime?: number } };

/** What a failed `callTool` throws; `code` is what the page reads. */
export class AdapterError extends Error {
  readonly code: string;

  constructor({ code, message }: DataFailure) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}

export type DataEvents = {
  /** Calls `onFocus` when the window regains focus; returns the way to stop. */
  onFocus: (onFocus: () => void) => () => void;
};

export type AdapterOptions = {
  linear: Pick<
    Linear,
    | 'listOpen'
    | 'listIdeas'
    | 'listClosed'
    | 'getIssue'
    | 'getIssueSummary'
    | 'listComments'
  >;
  supabase: Pick<
    ReturnType<typeof createSupabase>,
    | 'read'
    | 'readHostMetrics'
    | 'readPlanUsage'
    | 'readUsageHours'
    | 'readGithubEvents'
    | 'readSessions'
    | 'subscribe'
  >;
  now?: () => number;
  events?: DataEvents;
  /**
   * Called with the Realtime channel health when it changes, and once with false at start.
   * `connection` counts the times the channel went unhealthy and says since when it has been healthy.
   */
  onLive?: (live: boolean, connection: Connection) => void;
  /** Called with each `issue_events` row as it arrives, for the page's pulse */
  onIssue?: (row: IssueEventRow) => void;
};

/** The Realtime channel's record since the adapter started; `upSince` is null while it is down, `downSince` while it is up */
export type Connection = {
  retries: number;
  upSince: number | null;
  downSince: number | null;
  status: ChannelStatus | null;
  /** When the backoff timer fires next, in ms; null with none pending */
  nextAt: number | null;
};

const browserEvents: DataEvents = {
  onFocus: (onFocus) => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }
};

const toFailure = (error: unknown): DataFailure => {
  if (error instanceof LinearError || error instanceof SupabaseError)
    return { code: error.code, message: error.message };
  return {
    code: 'bad_response',
    message: error instanceof Error ? error.message : String(error)
  };
};

type Entry<T> = { value: T; storedAt: number };
type Watcher<T> = {
  pick: (value: T) => unknown;
  callback: (event: WatchEvent) => void;
};

/** One fetch per source at a time; every watcher of it hears the outcome. */
const createSource = <T>(
  server: Server,
  fetch: () => Promise<T>,
  now: () => number
) => {
  const watchers = new Set<Watcher<T>>();
  let cache: Entry<T> | undefined;
  let inflight: Promise<Entry<T>> | undefined;
  /** A refresh was requested while a fetch was in flight */
  let dirty = false;

  const followUp = (): void => {
    if (!dirty) return;
    dirty = false;
    void load().catch(() => undefined);
  };

  const notify = (entry: Entry<T>): void => {
    for (const w of [...watchers])
      w.callback({
        type: 'data',
        result: {
          payload: w.pick(entry.value),
          cache: { storedAt: entry.storedAt }
        }
      });
  };

  const run = async (): Promise<Entry<T>> => {
    let entry: Entry<T>;
    try {
      entry = { value: await Promise.resolve().then(fetch), storedAt: now() };
    } catch (error) {
      inflight = undefined;
      followUp();
      const failure = toFailure(error);
      for (const w of [...watchers])
        w.callback({ type: 'error', error: failure });
      throw error;
    }
    cache = entry;
    inflight = undefined;
    notify(entry);
    followUp();
    return entry;
  };

  const load = (): Promise<Entry<T>> => (inflight ??= run());

  return {
    server,
    watching: () => watchers.size > 0,
    clear: () => {
      cache = undefined;
    },
    /** Never rejects: failures reach the watchers. */
    refresh: (): Promise<void> => {
      if (inflight) dirty = true;
      return load().then(
        () => undefined,
        () => undefined
      );
    },
    /** Edits the cached value in place; a fetch in flight is followed up instead. */
    patch: (fn: (value: T) => T): void => {
      if (inflight) {
        dirty = true;
        return;
      }
      if (!cache) return;
      cache = { value: fn(cache.value), storedAt: now() };
      notify(cache);
    },
    read: (staleTime: number): Promise<Entry<T>> =>
      cache && now() - cache.storedAt < staleTime
        ? Promise.resolve(cache)
        : load(),
    watch: (watcher: Watcher<T>): (() => void) => {
      watchers.add(watcher);
      void load().catch(() => undefined);
      return () => {
        watchers.delete(watcher);
      };
    },
    drop: () => watchers.clear()
  };
};

type Source<T = unknown> = ReturnType<typeof createSource<T>>;

/** What the adapter does to every source, whatever it holds. */
type Tracked = Pick<
  Source,
  'server' | 'watching' | 'clear' | 'refresh' | 'drop'
>;

/** A source seen through the page's args, with the type erased. */
type Handle = {
  watch: (callback: (event: WatchEvent) => void) => () => void;
  call: (staleTime: number) => Promise<DataResult>;
};

const bind = <T>(source: Source<T>, pick: (value: T) => unknown): Handle => ({
  watch: (callback) => source.watch({ pick, callback }),
  call: async (staleTime) => {
    const entry = await source.read(staleTime);
    return {
      payload: pick(entry.value),
      cache: { storedAt: entry.storedAt }
    };
  }
});

const isOpenState = (value: unknown): value is OpenStatusType =>
  OPEN_STATES.some((s) => s === value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const createAdapter = ({
  linear,
  supabase,
  now = () => Date.now(),
  events = browserEvents,
  onLive,
  onIssue
}: AdapterOptions) => {
  const sources: Tracked[] = [];
  const track = <T>(server: Server, fetch: () => Promise<T>): Source<T> => {
    const source = createSource(server, fetch, now);
    sources.push(source);
    return source;
  };

  // Counts list fetches, so a single-issue lookup can tell a newer full list overtook it
  let listFetches = 0;
  const listed =
    <T>(fetch: () => Promise<T>) =>
    () => {
      listFetches += 1;
      return fetch();
    };
  const open = track(
    LINEAR,
    listed(() => linear.listOpen())
  );
  const ideas = track(
    LINEAR,
    listed(() => linear.listIdeas())
  );
  const closed = track(
    LINEAR,
    listed(() => linear.listClosed())
  );
  const queue = track(SUPABASE, () => supabase.read());
  const hostMetrics = track(SUPABASE, () => supabase.readHostMetrics());
  const planUsage = track(SUPABASE, () => supabase.readPlanUsage());
  const usageHours = track(SUPABASE, () => supabase.readUsageHours());
  const githubEvents = track(SUPABASE, () => supabase.readGithubEvents());
  const sessions = track(SUPABASE, () => supabase.readSessions());
  const details = new Map<string, Source<IssueDetail>>();
  const comments = new Map<string, Source<{ comments: Comment[] }>>();

  const issues = (list: Issue[]) => ({ issues: list });

  const resolve = (
    server: string,
    tool: string,
    args: Record<string, unknown>
  ): Handle | undefined => {
    if (server === LINEAR) {
      if (tool === 'list_issues') {
        if (args.label === IDEA_LABEL) return bind(ideas, issues);
        if (args.state === 'completed') return bind(closed, issues);
        const state = args.state;
        if (isOpenState(state))
          return bind(open, (buckets) => issues(buckets[state]));
        return undefined;
      }
      if (tool === 'get_issue') {
        const id = text(args.id);
        if (!id) return undefined;
        let source = details.get(id);
        if (!source) {
          source = track(LINEAR, () => linear.getIssue(id));
          details.set(id, source);
        }
        return bind(source, (detail) => detail);
      }
      if (tool === 'list_comments') {
        const id = text(args.issueId);
        if (!id) return undefined;
        let source = comments.get(id);
        if (!source) {
          source = track(LINEAR, () => linear.listComments(id));
          comments.set(id, source);
        }
        return bind(source, (list) => list);
      }
      return undefined;
    }
    if (server === SUPABASE) {
      const pick = (key: keyof QueuePayloads) => (payloads: QueuePayloads) =>
        payloads[key];
      if (tool === 'runs') return bind(queue, pick('runs'));
      if (tool === 'usage') return bind(queue, pick('usage'));
      if (tool === 'activity') return bind(queue, pick('activity'));
      if (tool === 'hostMetrics') return bind(hostMetrics, (rows) => rows);
      if (tool === 'planUsage') return bind(planUsage, (rows) => rows);
      if (tool === 'usageHours') return bind(usageHours, (rows) => rows);
      if (tool === 'githubEvents') return bind(githubEvents, (rows) => rows);
      if (tool === 'sessions') return bind(sessions, (rows) => rows);
    }
    return undefined;
  };

  const unknownTool = (server: string, tool: string): DataFailure => ({
    code: 'tool_error',
    message: `Unknown request ${server}.${tool}`
  });

  let stopped = false;
  const stopFns: (() => void)[] = [];

  const refreshWatched = (server: Server): Promise<void> =>
    Promise.all(
      sources
        .filter((s) => s.server === server && s.watching())
        .map((s) => s.refresh())
    ).then(() => undefined);

  const refreshLinear = () => {
    if (!stopped) void refreshWatched(LINEAR);
  };
  const refreshHostMetrics = () => {
    if (!stopped && hostMetrics.watching()) void hostMetrics.refresh();
  };
  const refreshPlanUsage = () => {
    if (!stopped && planUsage.watching()) void planUsage.refresh();
  };
  const refreshUsageHours = () => {
    if (!stopped && usageHours.watching()) void usageHours.refresh();
  };
  const refreshSessions = () => {
    if (!stopped && sessions.watching()) void sessions.refresh();
  };
  const refreshSupabase = () => {
    if (!stopped) void refreshWatched(SUPABASE);
  };

  // A repeated event replaces its subject's row; a patch before the first load does nothing
  const applyGithub = (row: GithubEventRow): void => {
    if (stopped) return;
    githubEvents.patch((list) =>
      [row, ...list.filter((r) => r.subject !== row.subject)].slice(
        0,
        GITHUB_EVENTS_LIMIT
      )
    );
  };

  const connection: Connection = {
    retries: 0,
    upSince: null,
    downSince: now(),
    status: null,
    nextAt: null
  };
  onLive?.(false, { ...connection });

  const pending = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout>;
      identifier: string | null;
      removed: boolean;
    }
  >();
  // The newest lookup per issue; an older reply that lands later is dropped
  const latest = new Map<string, number>();
  let lookups = 0;
  stopFns.push(() => {
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
  });

  const refreshLists = (): void => {
    for (const s of [open, ideas, closed]) if (s.watching()) void s.refresh();
  };

  const applyIssue = async (
    issueId: string,
    identifier: string | null,
    removed: boolean
  ): Promise<void> => {
    const lookup = ++lookups;
    latest.set(issueId, lookup);
    const listsAtStart = listFetches;
    let summary: Issue | null;
    try {
      // A removed issue is still readable from Linear, with its last state
      summary = removed ? null : await linear.getIssueSummary(issueId);
    } catch {
      if (!stopped && latest.get(issueId) === lookup)
        void refreshWatched(LINEAR);
      return;
    }
    if (stopped || latest.get(issueId) !== lookup) return;
    const found = summary;
    const id = found?.id ?? identifier;
    if (!id) {
      refreshLists();
      return;
    }
    // The page also reads these through cached calls, so the cache goes whether or not anyone watches
    for (const source of [details.get(id), comments.get(id)]) {
      source?.clear();
      if (source?.watching()) void source.refresh();
    }
    // A list fetch that started after this lookup began already holds the change
    if (listFetches !== listsAtStart) return;
    const without = (list: Issue[]): Issue[] => list.filter((i) => i.id !== id);
    const place = (list: Issue[], type: Issue['statusType']): Issue[] =>
      found?.statusType === type ? [...without(list), found] : without(list);
    open.patch((b) => ({
      triage: place(b.triage, 'triage'),
      backlog: place(b.backlog, 'backlog'),
      unstarted: place(b.unstarted, 'unstarted'),
      started: place(b.started, 'started')
    }));
    ideas.patch((list) =>
      found?.labels.includes(IDEA_LABEL)
        ? [...without(list), found]
        : without(list)
    );
    closed.patch((list) => place(list, 'completed'));
  };

  const queueIssue = (row: IssueEventRow): void => {
    if (stopped) return;
    const { issue_id, identifier, action } = row;
    onIssue?.(row);
    const previous = pending.get(issue_id);
    clearTimeout(previous?.timer);
    const timer = setTimeout(() => {
      const entry = pending.get(issue_id);
      pending.delete(issue_id);
      void applyIssue(
        issue_id,
        entry?.identifier ?? null,
        entry?.removed ?? false
      );
    }, ISSUE_COALESCE_MS);
    pending.set(issue_id, {
      timer,
      identifier: identifier ?? previous?.identifier ?? null,
      removed: action === 'issue:remove'
    });
  };

  // Realtime refetches on its own while healthy; the timer covers only the gaps.
  let subscribed = false;
  let backoffStep = 0;
  let backoffTimer: ReturnType<typeof setTimeout> | undefined;

  const timer = setInterval(() => {
    refreshLinear();
    if (!subscribed) refreshSupabase();
  }, REFRESH_MS);
  stopFns.push(() => clearInterval(timer));
  stopFns.push(() => clearTimeout(backoffTimer));

  const scheduleBackoff = () => {
    if (stopped || backoffTimer !== undefined) return;
    const delay = BACKOFF_MS[Math.min(backoffStep, BACKOFF_MS.length - 1)];
    backoffStep += 1;
    connection.nextAt = now() + delay;
    backoffTimer = setTimeout(() => {
      backoffTimer = undefined;
      connection.nextAt = null;
      refreshSupabase();
      if (!subscribed) scheduleBackoff();
      onLive?.(subscribed, { ...connection });
    }, delay);
  };

  const resetBackoff = () => {
    backoffStep = 0;
    clearTimeout(backoffTimer);
    backoffTimer = undefined;
    connection.nextAt = null;
  };

  let lastFocus = -Infinity;
  stopFns.push(
    events.onFocus(() => {
      if (now() - lastFocus < FOCUS_DEBOUNCE_MS) return;
      lastFocus = now();
      refreshLinear();
      refreshSupabase();
    })
  );

  // Each subscription has its number; a status from one that was replaced is ignored
  let generation = 0;
  let reconnecting: Promise<void> | null = null;
  const join = () => {
    const mine = ++generation;
    return supabase.subscribe(
      refreshSupabase,
      (healthy, status) => {
        if (mine !== generation) return;
        const before = `${connection.status}|${connection.nextAt}`;
        connection.status = status;
        const flipped = healthy !== subscribed;
        if (flipped) {
          if (healthy) {
            connection.upSince = now();
            connection.downSince = null;
          } else {
            connection.retries += 1;
            connection.upSince = null;
            connection.downSince ??= now();
          }
        }
        subscribed = healthy;
        if (healthy) {
          // Events may have been missed before the channel joined or while it was down
          refreshLinear();
          resetBackoff();
        } else {
          scheduleBackoff();
        }
        if (flipped || before !== `${connection.status}|${connection.nextAt}`)
          onLive?.(healthy, { ...connection });
      },
      queueIssue,
      refreshHostMetrics,
      refreshPlanUsage,
      refreshUsageHours,
      applyGithub,
      refreshSessions
    );
  };
  let leave = join();
  stopFns.push(() => {
    void leave();
  });

  function watchTool<S extends Server, T extends Tool<S>>(
    server: S,
    tool: T,
    args: Record<string, unknown>,
    callback: (event: WatchEvent<Requests[S][T]>) => void
  ): () => void;
  function watchTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    callback: (event: WatchEvent) => void
  ): () => void {
    const handle = stopped ? undefined : resolve(server, tool, args);
    if (!handle) {
      callback({ type: 'error', error: unknownTool(server, tool) });
      return () => undefined;
    }
    return handle.watch(callback);
  }

  async function callTool<S extends Server, T extends Tool<S>>(
    server: S,
    tool: T,
    args: Record<string, unknown>,
    options?: CallOptions
  ): Promise<DataResult<Requests[S][T]>>;
  async function callTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    options?: CallOptions
  ): Promise<DataResult> {
    const handle = resolve(server, tool, args);
    if (!handle) throw new AdapterError(unknownTool(server, tool));
    try {
      return await handle.call(options?.cache?.staleTime ?? 0);
    } catch (error) {
      throw new AdapterError(toFailure(error));
    }
  }

  return {
    watchTool,
    callTool,

    /** Clears the server's cache and refetches everything watched on it. */
    invalidate: (server: string): Promise<void> => {
      if (server !== LINEAR && server !== SUPABASE) return Promise.resolve();
      for (const s of sources) if (s.server === server) s.clear();
      return refreshWatched(server);
    },

    /** Leaves the Realtime channel once it is gone and joins again from the first backoff step; the retry count stays. */
    reconnect: (): Promise<void> => {
      if (stopped) return Promise.resolve();
      if (reconnecting) return reconnecting;
      // The old channel's close while it leaves is not a drop
      generation += 1;
      // The old channel is gone, so a live desk is down until the new one answers; not a drop
      if (subscribed) {
        subscribed = false;
        connection.upSince = null;
        connection.downSince ??= now();
      }
      // Shows at once; the old status would read CLOSED until the new channel answers
      connection.status = null;
      onLive?.(subscribed, { ...connection });
      reconnecting = (async () => {
        try {
          await leave();
          if (stopped) return;
          resetBackoff();
          leave = join();
          onLive?.(subscribed, { ...connection });
        } finally {
          reconnecting = null;
        }
      })();
      return reconnecting;
    },

    /** Stops the timer, the listeners and the Realtime channel, and silences the watchers. */
    stop: (): void => {
      stopped = true;
      for (const stopFn of stopFns.splice(0)) stopFn();
      for (const s of sources) s.drop();
    }
  };
};

export type Adapter = ReturnType<typeof createAdapter>;
