import { z } from 'zod';

export const DEBOUNCE_MS = 15_000;
export const MIN_GAP_MS = 60_000;
export const BEAT_MS = 30_000;
export const UNHEALTHY_MS = 120_000;

export const listenerStateShape = z.object({
  state: z.enum(['live', 'down']),
  since: z.string(),
  lastBeat: z.string(),
  lastEvent: z.string().nullable(),
  pid: z.number().int()
});
export type ListenerState = z.infer<typeof listenerStateShape>;

/** Channel statuses supabase-js reports */
export type ChannelStatus =
  'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const globalTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export interface ListenerDeps {
  pid: number;
  now: () => Date;
  /** Wakes the scheduler; returns false when the target is gone */
  wake: () => boolean;
  /** Persists a state snapshot */
  persist: (state: ListenerState) => void;
  log: (line: string) => void;
  /** Called when the listener should exit with 1 */
  fail: (reason: string) => void;
  timers?: Timers;
}

export interface Listener {
  /** A row changed in a watched table */
  event: () => void;
  /** The channel status changed */
  status: (status: ChannelStatus) => void;
  /** Writes the state with a fresh beat; call every BEAT_MS */
  beat: () => void;
  /** Writes `down` and cancels timers */
  stop: () => void;
  state: () => ListenerState;
}

export const createListener = (deps: ListenerDeps): Listener => {
  const timers = deps.timers ?? globalTimers;
  const iso = (): string => deps.now().toISOString();
  let current: ListenerState = {
    state: 'down',
    since: iso(),
    lastBeat: iso(),
    lastEvent: null,
    pid: deps.pid
  };
  let wakeTimer: unknown;
  let unhealthyTimer: unknown;
  let lastWake: number | undefined;
  let stopped = false;

  const save = (patch: Partial<ListenerState> = {}): void => {
    current = { ...current, ...patch, lastBeat: iso() };
    deps.persist(current);
  };

  const setState = (state: ListenerState['state']): void => {
    if (state === current.state) return;
    deps.log(`listener ${state}`);
    save({ state, since: iso() });
  };

  /**
   * Debounce is fixed-window: the first event starts a DEBOUNCE_MS timer and
   * events inside it join that wake instead of pushing it later, so a steady
   * stream cannot starve the scheduler. A wake due inside MIN_GAP_MS of the
   * last one is deferred to the gap's end, never dropped.
   */
  const schedule = (delayMs: number): void => {
    if (stopped || wakeTimer !== undefined) return;
    const gapLeft =
      lastWake === undefined
        ? 0
        : Math.max(0, lastWake + MIN_GAP_MS - deps.now().getTime());
    wakeTimer = timers.set(fire, Math.max(delayMs, gapLeft));
  };

  const fire = (): void => {
    wakeTimer = undefined;
    if (stopped) return;
    lastWake = deps.now().getTime();
    if (deps.wake()) {
      deps.log('wake sent');
    } else {
      deps.log('wake target is gone');
      current = { ...current, state: 'down', since: iso() };
      save();
      stopped = true;
      deps.fail('wake target is gone');
    }
  };

  return {
    state: () => current,
    event: () => {
      save({ lastEvent: iso() });
      schedule(DEBOUNCE_MS);
    },
    status: (status) => {
      if (stopped) return;
      if (status === 'SUBSCRIBED') {
        if (unhealthyTimer !== undefined) {
          timers.clear(unhealthyTimer);
          unhealthyTimer = undefined;
        }
        setState('live');
        // Catch-up for events missed while not subscribed
        schedule(0);
        return;
      }
      setState('down');
      unhealthyTimer ??= timers.set(() => {
        unhealthyTimer = undefined;
        if (stopped) return;
        deps.log(`channel not back within ${UNHEALTHY_MS / 1000}s`);
        stopped = true;
        deps.fail('channel unhealthy');
      }, UNHEALTHY_MS);
    },
    beat: () => {
      if (!stopped) save();
    },
    stop: () => {
      stopped = true;
      if (wakeTimer !== undefined) timers.clear(wakeTimer);
      if (unhealthyTimer !== undefined) timers.clear(unhealthyTimer);
      wakeTimer = unhealthyTimer = undefined;
      current = { ...current, state: 'down', since: iso() };
      save();
    }
  };
};
