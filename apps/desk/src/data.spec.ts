import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type WatchEvent, createAdapter } from './data';
import type { Issue } from './linear';
import { LinearError } from './linear';
import { SupabaseError } from './supabase';

const issue = (id: string, statusType: Issue['statusType']): Issue => ({
  id,
  title: id,
  priority: { value: 2 },
  status: 'x',
  statusType,
  labels: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  url: `https://linear.app/${id}`,
  completedAt: null,
  canceledAt: null
});

const setup = () => {
  const linear = {
    listOpen: vi.fn(() =>
      Promise.resolve({
        triage: [issue('COD-1', 'triage')],
        backlog: [issue('COD-2', 'backlog')],
        unstarted: [issue('COD-3', 'unstarted')],
        started: [issue('COD-4', 'started')]
      })
    ),
    listIdeas: vi.fn(() => Promise.resolve([issue('COD-5', 'backlog')])),
    listClosed: vi.fn(() => Promise.resolve([issue('COD-6', 'completed')])),
    getIssue: vi.fn((id: string) =>
      Promise.resolve({
        description: id,
        relations: { blockedBy: [] },
        attachments: []
      })
    ),
    listComments: vi.fn(() => Promise.resolve({ comments: [] }))
  };
  const supabaseRead = vi.fn(() =>
    Promise.resolve({
      runs: null,
      usage: {
        updated: '',
        windowDays: 30,
        total: 1,
        pricesDate: '',
        unpriced: [],
        models: [],
        days: [],
        tickets: []
      },
      activity: null
    })
  );
  let changed: () => void = () => undefined;
  let status: (healthy: boolean) => void = () => undefined;
  const unsubscribe = vi.fn();
  const supabase = {
    read: supabaseRead,
    subscribe: vi.fn(
      (onChange: () => void, onStatus?: (healthy: boolean) => void) => {
        changed = onChange;
        if (onStatus) status = onStatus;
        return unsubscribe;
      }
    )
  };
  let focus: () => void = () => undefined;
  const stopFocus = vi.fn();
  const events = {
    onFocus: (onFocus: () => void) => {
      focus = onFocus;
      return stopFocus;
    }
  };
  const adapter = createAdapter({ linear, supabase, events });
  return {
    adapter,
    linear,
    supabase,
    unsubscribe,
    stopFocus,
    fireChange: () => changed(),
    fireStatus: (healthy: boolean) => status(healthy),
    fireFocus: () => focus()
  };
};

const FIELDS = { team: 'Codeware', limit: 250 };
const OPEN = ['triage', 'backlog', 'unstarted', 'started'] as const;

const watchOpen = (
  adapter: ReturnType<typeof setup>['adapter'],
  events: WatchEvent[] = []
) => {
  for (const state of OPEN) {
    adapter.watchTool('Linear', 'list_issues', { ...FIELDS, state }, (e) =>
      events.push(e)
    );
  }
  return events;
};

describe('createAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the four open watchers from one listOpen call', async () => {
    const { adapter, linear } = setup();
    const events = watchOpen(adapter);
    await vi.advanceTimersByTimeAsync(0);

    expect(linear.listOpen).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.type)).toEqual(Array(4).fill('data'));
    ['COD-1', 'COD-2', 'COD-3', 'COD-4'].forEach((id, i) => {
      expect(events[i]).toMatchObject({
        result: { payload: { issues: [{ id }] } }
      });
    });
  });

  it('answers ideas, closed, details, comments and Supabase', async () => {
    const { adapter, linear, supabase } = setup();
    const seen: Record<string, WatchEvent> = {};
    const keep = (name: string) => (e: WatchEvent) => {
      seen[name] = e;
    };
    adapter.watchTool(
      'Linear',
      'list_issues',
      { label: 'agent-idea' },
      keep('ideas')
    );
    adapter.watchTool(
      'Linear',
      'list_issues',
      { state: 'completed' },
      keep('closed')
    );
    for (const tool of ['runs', 'usage', 'activity']) {
      adapter.watchTool('Supabase', tool, {}, keep(tool));
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(linear.listIdeas).toHaveBeenCalledTimes(1);
    expect(linear.listClosed).toHaveBeenCalledTimes(1);
    expect(supabase.read).toHaveBeenCalledTimes(1);
    expect(seen.ideas).toMatchObject({
      type: 'data',
      result: { payload: { issues: [{ id: 'COD-5' }] } }
    });
    expect(seen.usage).toMatchObject({
      result: { payload: { total: 1 } }
    });
    expect(seen.runs).toMatchObject({ result: { payload: null } });

    const detail = await adapter.callTool('Linear', 'get_issue', {
      id: 'COD-9',
      includeRelations: true
    });
    expect(detail.payload).toMatchObject({ description: 'COD-9' });
    await adapter.callTool('Linear', 'list_comments', { issueId: 'COD-9' });
    expect(linear.listComments).toHaveBeenCalledWith('COD-9');
  });

  it('caches callTool inside the stale time only', async () => {
    const { adapter, linear } = setup();
    const call = () =>
      adapter.callTool(
        'Linear',
        'get_issue',
        { id: 'COD-9' },
        { cache: { staleTime: 60000 } }
      );
    const first = await call();
    await vi.advanceTimersByTimeAsync(59000);
    const second = await call();
    expect(linear.getIssue).toHaveBeenCalledTimes(1);
    expect(second.cache.storedAt).toBe(first.cache.storedAt);

    await vi.advanceTimersByTimeAsync(2000);
    await call();
    expect(linear.getIssue).toHaveBeenCalledTimes(2);
  });

  it('refetches every watcher on invalidate and clears the cache', async () => {
    const { adapter, linear, supabase } = setup();
    const events = watchOpen(adapter);
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await adapter.callTool(
      'Linear',
      'get_issue',
      { id: 'COD-9' },
      { cache: { staleTime: 600000 } }
    );
    await vi.advanceTimersByTimeAsync(0);
    events.length = 0;

    await adapter.invalidate('Linear');
    expect(linear.listOpen).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(4);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    await adapter.callTool(
      'Linear',
      'get_issue',
      { id: 'COD-9' },
      { cache: { staleTime: 600000 } }
    );
    expect(linear.getIssue).toHaveBeenCalledTimes(2);

    await adapter.invalidate('Supabase');
    expect(supabase.read).toHaveBeenCalledTimes(2);
  });

  it('refetches Linear on focus, at most once per 10 s', async () => {
    const { adapter, linear, fireFocus } = setup();
    watchOpen(adapter);
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(1);

    fireFocus();
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    fireFocus();
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(6000);
    fireFocus();
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(3);
  });

  it('refetches Linear every 2 minutes, not Supabase while Realtime is healthy', async () => {
    const { adapter, linear, supabase, fireStatus } = setup();
    fireStatus(true);
    watchOpen(adapter);
    adapter.watchTool('Supabase', 'usage', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(119000);
    expect(linear.listOpen).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120000);
    expect(linear.listOpen).toHaveBeenCalledTimes(3);
    expect(supabase.read).toHaveBeenCalledTimes(1);
  });

  it('refetches Supabase when the subscription fires', async () => {
    const { adapter, linear, supabase, fireChange } = setup();
    watchOpen(adapter);
    adapter.watchTool('Supabase', 'usage', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    fireChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(2);
    expect(linear.listOpen).toHaveBeenCalledTimes(1);
  });

  it('runs one follow-up read for changes during a read', async () => {
    const { adapter, supabase, fireChange } = setup();
    const payload = await supabase.read();
    supabase.read.mockClear();
    let finish: () => void = () => undefined;
    supabase.read.mockImplementationOnce(
      () =>
        new Promise<typeof payload>((resolve) => {
          finish = () => resolve(payload);
        })
    );
    adapter.watchTool('Supabase', 'usage', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    fireChange();
    fireChange();
    const pending = adapter.invalidate('Supabase');
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    finish();
    await pending;
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(supabase.read).toHaveBeenCalledTimes(2);
  });

  it('maps errors to codes and keeps going', async () => {
    const { adapter, linear, supabase } = setup();
    linear.listOpen.mockRejectedValueOnce(
      new LinearError('unauthorized', 'Linear rejected the API key')
    );
    supabase.read.mockRejectedValueOnce(new SupabaseError('network', 'down'));
    const events = watchOpen(adapter);
    const runs: WatchEvent[] = [];
    adapter.watchTool('Supabase', 'runs', {}, (e) => runs.push(e));
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toHaveLength(4);
    for (const e of events)
      expect(e).toEqual({
        type: 'error',
        error: { code: 'unauthorized', message: 'Linear rejected the API key' }
      });
    expect(runs).toEqual([
      { type: 'error', error: { code: 'network', message: 'down' } }
    ]);

    await adapter.invalidate('Linear');
    expect(events.at(-1)?.type).toBe('data');

    linear.getIssue.mockRejectedValueOnce(
      new LinearError('rate_limited', 'slow down')
    );
    await expect(
      adapter.callTool('Linear', 'get_issue', { id: 'COD-1' })
    ).rejects.toMatchObject({ code: 'rate_limited', message: 'slow down' });
  });

  it('reports a request it does not know', async () => {
    const { adapter } = setup();
    const events: WatchEvent[] = [];
    adapter.watchTool('Linear', 'list_issues', { team: 'x' }, (e) =>
      events.push(e)
    );
    expect(events).toEqual([
      {
        type: 'error',
        error: {
          code: 'tool_error',
          message: 'Unknown request Linear.list_issues'
        }
      }
    ]);
    await expect(adapter.callTool('Nope', 'x', {})).rejects.toMatchObject({
      code: 'tool_error'
    });
  });

  it('stops the timer, the listeners and the channel', async () => {
    const { adapter, linear, unsubscribe, stopFocus, fireFocus } = setup();
    const events = watchOpen(adapter);
    await vi.advanceTimersByTimeAsync(0);
    events.length = 0;

    adapter.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(stopFocus).toHaveBeenCalledTimes(1);

    fireFocus();
    await vi.advanceTimersByTimeAsync(300000);
    expect(linear.listOpen).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });

  it('refetches Supabase on window focus, debounced', async () => {
    const { adapter, supabase, fireFocus } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    fireFocus();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(2);

    fireFocus();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(2);
  });

  it('refetches Supabase on a channel error with a growing backoff', async () => {
    const { adapter, supabase, fireStatus } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    fireStatus(false);
    await vi.advanceTimersByTimeAsync(14000);
    expect(supabase.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(supabase.read).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30000);
    expect(supabase.read).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60000);
    expect(supabase.read).toHaveBeenCalledTimes(4);
  });

  it('stops the backoff and resets it once the channel is back', async () => {
    const { adapter, supabase, fireStatus } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    fireStatus(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(supabase.read).toHaveBeenCalledTimes(2);
    fireStatus(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(supabase.read).toHaveBeenCalledTimes(2);

    fireStatus(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(supabase.read).toHaveBeenCalledTimes(3);
  });

  it('does not poll Supabase while the channel is healthy', async () => {
    const { adapter, supabase, fireStatus } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    fireStatus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.read).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(supabase.read).toHaveBeenCalledTimes(1);
  });

  it('polls Supabase on the fallback timer while the channel is down', async () => {
    const { adapter, supabase } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(supabase.read).toHaveBeenCalledTimes(2);
  });

  it('invalidates both servers from the Refresh button', async () => {
    const { adapter, linear, supabase } = setup();
    watchOpen(adapter);
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    await Promise.all([
      adapter.invalidate('Linear'),
      adapter.invalidate('Supabase')
    ]);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);
    expect(supabase.read).toHaveBeenCalledTimes(2);
  });
});
