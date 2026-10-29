import {
  type ListenerState,
  createListener,
  listenerStateShape
} from './listen.logic';

const setup = () => {
  const persisted: ListenerState[] = [];
  const wake = vi.fn(() => true);
  const fail = vi.fn();
  const listener = createListener({
    pid: 42,
    now: () => new Date(Date.now()),
    wake,
    persist: (s) => persisted.push(s),
    log: () => undefined,
    fail
  });
  return { listener, persisted, wake, fail };
};

describe('listener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('wakes once after the debounce, joining events inside it', () => {
    const { listener, wake } = setup();
    listener.event();
    vi.advanceTimersByTime(10_000);
    listener.event();
    vi.advanceTimersByTime(4_999);
    expect(wake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('defers a wake inside the minimum gap instead of dropping it', () => {
    const { listener, wake } = setup();
    listener.event();
    vi.advanceTimersByTime(15_000);
    expect(wake).toHaveBeenCalledTimes(1);
    listener.event();
    vi.advanceTimersByTime(15_000);
    expect(wake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(44_999);
    expect(wake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(2);
  });

  it('wakes once on subscribe, and again on resubscribe after the gap', () => {
    const { listener, wake } = setup();
    listener.status('SUBSCRIBED');
    vi.advanceTimersByTime(0);
    expect(wake).toHaveBeenCalledTimes(1);
    listener.status('CHANNEL_ERROR');
    listener.status('SUBSCRIBED');
    vi.advanceTimersByTime(59_999);
    expect(wake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(2);
  });

  it('keeps since while the state is unchanged and moves it on a change', () => {
    const { listener } = setup();
    listener.status('SUBSCRIBED');
    const since = listener.state().since;
    vi.advanceTimersByTime(30_000);
    listener.beat();
    const beat = listener.state();
    expect(beat.state).toBe('live');
    expect(beat.since).toBe(since);
    expect(beat.lastBeat).not.toBe(since);
    listener.status('TIMED_OUT');
    expect(listener.state().state).toBe('down');
    expect(listener.state().since).not.toBe(since);
  });

  it('records the last event and persists a valid shape', () => {
    const { listener, persisted } = setup();
    expect(listener.state().lastEvent).toBeNull();
    listener.event();
    expect(listener.state().lastEvent).toBe('2026-10-29T10:00:00.000Z');
    for (const s of persisted) expect(listenerStateShape.parse(s)).toEqual(s);
  });

  it('fails after 2 minutes without a subscription', () => {
    const { listener, fail } = setup();
    listener.status('SUBSCRIBED');
    listener.status('CLOSED');
    vi.advanceTimersByTime(119_999);
    expect(fail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('cancels the unhealthy timer when resubscribed', () => {
    const { listener, fail } = setup();
    listener.status('CHANNEL_ERROR');
    vi.advanceTimersByTime(100_000);
    listener.status('SUBSCRIBED');
    vi.advanceTimersByTime(300_000);
    expect(fail).not.toHaveBeenCalled();
  });

  it('writes down and fails when the wake target is gone', () => {
    const { listener, wake, fail } = setup();
    wake.mockReturnValue(false);
    listener.status('SUBSCRIBED');
    vi.advanceTimersByTime(0);
    expect(listener.state().state).toBe('down');
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('writes down and stays quiet after stop', () => {
    const { listener, wake } = setup();
    listener.status('SUBSCRIBED');
    listener.event();
    listener.stop();
    vi.advanceTimersByTime(300_000);
    expect(listener.state().state).toBe('down');
    expect(wake).not.toHaveBeenCalled();
  });
});
