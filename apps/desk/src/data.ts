import {
  type Comment,
  type Issue,
  type IssueDetail,
  type Linear,
  LinearError,
  type OpenStatusType
} from './linear';
import { type Payloads, SupabaseError, type createSupabase } from './supabase';

const LINEAR = 'Linear';
const SUPABASE = 'Supabase';
const IDEA_LABEL = 'agent-idea';
const OPEN_STATES: readonly OpenStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started'
];
const REFRESH_MS = 2 * 60 * 1000;
const FOCUS_DEBOUNCE_MS = 10 * 1000;
const BACKOFF_MS = [15 * 1000, 30 * 1000, 60 * 1000];

type Server = typeof LINEAR | typeof SUPABASE;

export type DataFailure = { code: string; message: string };

export type DataResult = {
  payload: unknown;
  cache: { storedAt: number };
};

export type WatchEvent =
  { type: 'data'; result: DataResult } | { type: 'error'; error: DataFailure };

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
    'listOpen' | 'listIdeas' | 'listClosed' | 'getIssue' | 'listComments'
  >;
  supabase: Pick<ReturnType<typeof createSupabase>, 'read' | 'subscribe'>;
  now?: () => number;
  events?: DataEvents;
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
    for (const w of [...watchers])
      w.callback({
        type: 'data',
        result: {
          payload: w.pick(entry.value),
          cache: { storedAt: entry.storedAt }
        }
      });
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
  events = browserEvents
}: AdapterOptions) => {
  const sources: Tracked[] = [];
  const track = <T>(server: Server, fetch: () => Promise<T>): Source<T> => {
    const source = createSource(server, fetch, now);
    sources.push(source);
    return source;
  };

  const open = track(LINEAR, () => linear.listOpen());
  const ideas = track(LINEAR, () => linear.listIdeas());
  const closed = track(LINEAR, () => linear.listClosed());
  const queue = track(SUPABASE, () => supabase.read());
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
      const pick = (key: keyof Payloads) => (payloads: Payloads) =>
        payloads[key];
      if (tool === 'runs') return bind(queue, pick('runs'));
      if (tool === 'usage') return bind(queue, pick('usage'));
      if (tool === 'activity') return bind(queue, pick('activity'));
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
  const refreshSupabase = () => {
    if (!stopped) void refreshWatched(SUPABASE);
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
    backoffTimer = setTimeout(() => {
      backoffTimer = undefined;
      refreshSupabase();
      if (!subscribed) scheduleBackoff();
    }, delay);
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

  stopFns.push(
    supabase.subscribe(refreshSupabase, (healthy) => {
      subscribed = healthy;
      if (healthy) {
        backoffStep = 0;
        clearTimeout(backoffTimer);
        backoffTimer = undefined;
      } else {
        scheduleBackoff();
      }
    })
  );

  return {
    watchTool: (
      server: string,
      tool: string,
      args: Record<string, unknown>,
      callback: (event: WatchEvent) => void
    ): (() => void) => {
      const handle = stopped ? undefined : resolve(server, tool, args);
      if (!handle) {
        callback({ type: 'error', error: unknownTool(server, tool) });
        return () => undefined;
      }
      return handle.watch(callback);
    },

    callTool: async (
      server: string,
      tool: string,
      args: Record<string, unknown>,
      options?: CallOptions
    ): Promise<DataResult> => {
      const handle = resolve(server, tool, args);
      if (!handle) throw new AdapterError(unknownTool(server, tool));
      try {
        return await handle.call(options?.cache?.staleTime ?? 0);
      } catch (error) {
        throw new AdapterError(toFailure(error));
      }
    },

    /** Clears the server's cache and refetches everything watched on it. */
    invalidate: (server: string): Promise<void> => {
      if (server !== LINEAR && server !== SUPABASE) return Promise.resolve();
      for (const s of sources) if (s.server === server) s.clear();
      return refreshWatched(server);
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
