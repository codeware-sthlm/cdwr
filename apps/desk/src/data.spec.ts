import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type WatchEvent, createAdapter } from './data';
import type { Issue } from './linear';
import { LinearError } from './linear';
import {
  type GithubEventRow,
  type IssueEventRow,
  type QueueStateRow,
  SupabaseError,
  toRuns
} from './supabase';

const issue = (id: string, statusType: Issue['statusType']): Issue => ({
  id,
  title: id,
  priority: { value: 2 },
  status: 'x',
  statusType,
  labels: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  url: `https://linear.app/${id}`,
  completedAt: null,
  canceledAt: null
});

const summaryOf = (
  id: string,
  statusType: Issue['statusType'],
  labels: string[] = []
): Issue => ({ ...issue(id, statusType), labels });

const queueState: QueueStateRow = {
  host: 'mac',
  at: '2026-10-28T10:00:00.000Z',
  last_run: '2026-10-28 09:50 · planned COD-1',
  attended: 'run now: COD-2 answered',
  suggested: '2026-10-28 · COD-7 Trim the cache',
  job: 'Job: every 10 min · install current',
  view: {
    at: '2026-10-28T10:00:00.000Z',
    limit: { used: 1, max: 3 },
    table: { before: [{ ticket: 'COD-2', kind: 'question' }], after: [] }
  }
};

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
    getIssueSummary: vi.fn<(id: string) => Promise<Issue | null>>(() =>
      Promise.resolve(null)
    ),
    listComments: vi.fn(() => Promise.resolve({ comments: [] }))
  };
  const supabaseRead = vi.fn(() =>
    Promise.resolve({
      runs: toRuns([queueState], []),
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
  const supabaseReadHost = vi.fn(() => Promise.resolve([]));
  let changed: () => void = () => undefined;
  let status: (healthy: boolean) => void = () => undefined;
  const unsubscribe = vi.fn();
  let issueEvent: (row: IssueEventRow) => void = () => undefined;
  const supabaseReadPlan = vi.fn(() => Promise.resolve([]));
  const supabaseReadHours = vi.fn(() => Promise.resolve([]));
  const supabaseReadGithub = vi.fn<() => Promise<GithubEventRow[]>>(() =>
    Promise.resolve([])
  );
  const supabaseReadSessions = vi.fn(() => Promise.resolve([]));
  let hostEvent: () => void = () => undefined;
  let planEvent: () => void = () => undefined;
  let hoursEvent: () => void = () => undefined;
  let githubEvent: (row: GithubEventRow) => void = () => undefined;
  let sessionsEvent: () => void = () => undefined;
  const supabase = {
    read: supabaseRead,
    readHostMetrics: supabaseReadHost,
    readPlanUsage: supabaseReadPlan,
    readUsageHours: supabaseReadHours,
    readGithubEvents: supabaseReadGithub,
    readSessions: supabaseReadSessions,
    subscribe: vi.fn(
      (
        onChange: () => void,
        onStatus?: (healthy: boolean) => void,
        onIssue?: (row: IssueEventRow) => void,
        onHostMetrics?: () => void,
        onPlanUsage?: () => void,
        onUsageHours?: () => void,
        onGithub?: (row: GithubEventRow) => void,
        onSessions?: () => void
      ) => {
        changed = onChange;
        if (onGithub) githubEvent = onGithub;
        if (onSessions) sessionsEvent = onSessions;
        if (onHostMetrics) hostEvent = onHostMetrics;
        if (onPlanUsage) planEvent = onPlanUsage;
        if (onUsageHours) hoursEvent = onUsageHours;
        if (onStatus) status = onStatus;
        if (onIssue) issueEvent = onIssue;
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
  const onLive = vi.fn();
  const adapter = createAdapter({ linear, supabase, events, onLive });
  return {
    adapter,
    linear,
    supabase,
    unsubscribe,
    onLive,
    fireIssue: (
      issueId: string,
      identifier: string | null = null,
      action = 'issue:update'
    ) =>
      issueEvent({
        issue_id: issueId,
        identifier,
        action,
        updated_at: '2026-10-28T12:00:00.000Z'
      }),
    stopFocus,
    fireChange: () => changed(),
    fireHostMetrics: () => hostEvent(),
    firePlanUsage: () => planEvent(),
    fireUsageHours: () => hoursEvent(),
    fireGithub: (row: GithubEventRow) => githubEvent(row),
    fireSessions: () => sessionsEvent(),
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
    for (const tool of ['runs', 'usage', 'activity'] as const) {
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
    expect(seen.runs).toMatchObject({
      result: {
        payload: {
          attended: { verdict: 'run now', text: 'COD-2 answered' },
          suggested: { kind: 'suggested', ticket: 'COD-7' },
          job: { minutes: 10, host: 'launchd', install: 'current' },
          qv: { limit: { used: 1, max: 3 }, session: { state: 'none' } }
        }
      }
    });

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

  it('refetches Linear every 5 minutes, not Supabase while Realtime is healthy', async () => {
    const { adapter, linear, supabase, fireStatus } = setup();
    fireStatus(true);
    watchOpen(adapter);
    adapter.watchTool('Supabase', 'usage', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(299000);
    expect(linear.listOpen).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300000);
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

  it('keeps the other Supabase tools when host_metrics fails', async () => {
    const { adapter, supabase } = setup();
    supabase.readHostMetrics.mockRejectedValueOnce(
      new SupabaseError('bad_response', 'relation does not exist')
    );
    const seen: Record<string, WatchEvent> = {};
    adapter.watchTool('Supabase', 'runs', {}, (e) => {
      seen['runs'] = e;
    });
    adapter.watchTool('Supabase', 'hostMetrics', {}, (e) => {
      seen['hostMetrics'] = e;
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(seen['runs']?.type).toBe('data');
    expect(seen['hostMetrics']).toMatchObject({
      type: 'error',
      error: { code: 'bad_response' }
    });
  });

  it('rereads only host_metrics on a new sample', async () => {
    const { adapter, supabase, fireHostMetrics } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    adapter.watchTool('Supabase', 'hostMetrics', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    fireHostMetrics();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.readHostMetrics).toHaveBeenCalledTimes(2);
    expect(supabase.read).toHaveBeenCalledTimes(1);
  });

  it('keeps the other Supabase tools when plan_usage or usage_hours fails', async () => {
    const { adapter, supabase } = setup();
    supabase.readPlanUsage.mockRejectedValueOnce(
      new SupabaseError('bad_response', 'relation does not exist')
    );
    supabase.readUsageHours.mockRejectedValueOnce(
      new SupabaseError('bad_response', 'relation does not exist')
    );
    const seen: Record<string, WatchEvent> = {};
    for (const tool of ['runs', 'planUsage', 'usageHours'] as const)
      adapter.watchTool('Supabase', tool, {}, (e) => {
        seen[tool] = e;
      });
    await vi.advanceTimersByTimeAsync(0);

    expect(seen['runs']?.type).toBe('data');
    for (const tool of ['planUsage', 'usageHours'])
      expect(seen[tool]).toMatchObject({
        type: 'error',
        error: { code: 'bad_response' }
      });
  });

  it('rereads only plan_usage on a new sample and only usage_hours on a new hour', async () => {
    const { adapter, supabase, firePlanUsage, fireUsageHours } = setup();
    adapter.watchTool('Supabase', 'runs', {}, () => undefined);
    adapter.watchTool('Supabase', 'planUsage', {}, () => undefined);
    adapter.watchTool('Supabase', 'usageHours', {}, () => undefined);
    await vi.advanceTimersByTimeAsync(0);

    firePlanUsage();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.readPlanUsage).toHaveBeenCalledTimes(2);
    expect(supabase.readUsageHours).toHaveBeenCalledTimes(1);

    fireUsageHours();
    await vi.advanceTimersByTimeAsync(0);
    expect(supabase.readUsageHours).toHaveBeenCalledTimes(2);
    expect(supabase.readPlanUsage).toHaveBeenCalledTimes(2);
    expect(supabase.read).toHaveBeenCalledTimes(1);
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
    // @ts-expect-error: an unknown request does not compile, and still fails at runtime
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
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
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

  describe('issue events', () => {
    type Harness = ReturnType<typeof setup>;
    type Lists = Record<
      'triage' | 'backlog' | 'unstarted' | 'started',
      string[]
    >;

    const watchAll = async (h: Harness) => {
      const lists: Lists = {
        triage: [],
        backlog: [],
        unstarted: [],
        started: []
      };
      const state: { ideas: string[]; closed: string[]; emits: number } = {
        ideas: [],
        closed: [],
        emits: 0
      };
      const ids = (e: WatchEvent): string[] => {
        if (e.type !== 'data') return [];
        const p = e.result.payload;
        if (typeof p !== 'object' || p === null || !('issues' in p)) return [];
        return Array.isArray(p.issues)
          ? p.issues.flatMap((i: unknown) =>
              typeof i === 'object' &&
              i !== null &&
              'id' in i &&
              typeof i.id === 'string'
                ? [i.id]
                : []
            )
          : [];
      };
      for (const s of OPEN)
        h.adapter.watchTool(
          'Linear',
          'list_issues',
          { ...FIELDS, state: s },
          (e) => {
            lists[s] = ids(e);
            state.emits += 1;
          }
        );
      h.adapter.watchTool(
        'Linear',
        'list_issues',
        { ...FIELDS, label: 'agent-idea' },
        (e) => (state.ideas = ids(e))
      );
      h.adapter.watchTool(
        'Linear',
        'list_issues',
        { ...FIELDS, state: 'completed' },
        (e) => (state.closed = ids(e))
      );
      await vi.advanceTimersByTimeAsync(0);
      return { lists, state };
    };

    const settle = () => vi.advanceTimersByTimeAsync(500);

    it('patches an issue into its new bucket without refetching', async () => {
      const h = setup();
      const { lists } = await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      h.fireIssue('uuid-1');
      await settle();

      expect(h.linear.getIssueSummary).toHaveBeenCalledWith('uuid-1');
      expect(lists.triage).toEqual([]);
      expect(lists.started.sort()).toEqual(['COD-1', 'COD-4']);
      expect(h.linear.listOpen).toHaveBeenCalledTimes(1);
    });

    it('adds a new open issue to its bucket', async () => {
      const h = setup();
      const { lists } = await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-9', 'backlog'));
      h.fireIssue('uuid-9');
      await settle();
      expect(lists.backlog.sort()).toEqual(['COD-2', 'COD-9']);
    });

    it('keeps idea and closed membership by label and state', async () => {
      const h = setup();
      const { lists, state } = await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(
        summaryOf('COD-1', 'completed', ['agent-idea'])
      );
      h.fireIssue('uuid-1');
      await settle();

      expect(lists.triage).toEqual([]);
      expect(state.ideas.sort()).toEqual(['COD-1', 'COD-5']);
      expect(state.closed.sort()).toEqual(['COD-1', 'COD-6']);

      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      h.fireIssue('uuid-1');
      await settle();
      expect(state.ideas).toEqual(['COD-5']);
      expect(state.closed).toEqual(['COD-6']);
      expect(lists.started.sort()).toEqual(['COD-1', 'COD-4']);
    });

    it('drops a removed issue everywhere, matching on the row identifier', async () => {
      const h = setup();
      const { lists, state } = await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(null);
      h.fireIssue('uuid-6', 'COD-6');
      h.fireIssue('uuid-3', 'COD-3');
      await settle();
      expect(state.closed).toEqual([]);
      expect(lists.unstarted).toEqual([]);
      expect(h.linear.listOpen).toHaveBeenCalledTimes(1);
    });

    it('drops a lookup that a newer full list fetch overtook', async () => {
      const h = setup();
      const { lists, state } = await watchAll(h);
      let answer: (issue: Issue) => void = () => undefined;
      h.linear.getIssueSummary.mockImplementationOnce(
        () => new Promise<Issue>((resolve) => (answer = resolve))
      );
      h.fireIssue('uuid-1');
      await settle();

      await h.adapter.invalidate('Linear');
      const listed = h.linear.listOpen.mock.calls.length;
      answer(summaryOf('COD-1', 'started'));
      await vi.advanceTimersByTimeAsync(0);
      expect(h.linear.listOpen).toHaveBeenCalledTimes(listed);
      expect(lists.started).toEqual(['COD-4']);
      expect(lists.triage).toEqual(['COD-1']);
      expect(state.closed).toEqual(['COD-6']);
    });

    it('drops an issue on a remove event without looking it up', async () => {
      const h = setup();
      const { lists } = await watchAll(h);
      h.fireIssue('uuid-3', 'COD-3', 'issue:remove');
      await settle();
      expect(h.linear.getIssueSummary).not.toHaveBeenCalled();
      expect(lists.unstarted).toEqual([]);
    });

    it('ignores a reply older than the newest lookup of the issue', async () => {
      const h = setup();
      const { lists, state } = await watchAll(h);
      let answerOld: (issue: Issue) => void = () => undefined;
      h.linear.getIssueSummary
        .mockImplementationOnce(
          () => new Promise<Issue>((resolve) => (answerOld = resolve))
        )
        .mockResolvedValueOnce(summaryOf('COD-1', 'completed'));
      h.fireIssue('uuid-1');
      await settle();
      h.fireIssue('uuid-1');
      await settle();
      expect(state.closed.sort()).toEqual(['COD-1', 'COD-6']);

      answerOld(summaryOf('COD-1', 'started'));
      await vi.advanceTimersByTimeAsync(0);
      expect(state.closed.sort()).toEqual(['COD-1', 'COD-6']);
      expect(lists.started).toEqual(['COD-4']);
    });

    it('refreshes the lists when the issue cannot be matched', async () => {
      const h = setup();
      await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(null);
      h.fireIssue('uuid-x');
      await settle();
      expect(h.linear.listOpen).toHaveBeenCalledTimes(2);
      expect(h.linear.listIdeas).toHaveBeenCalledTimes(2);
      expect(h.linear.listClosed).toHaveBeenCalledTimes(2);
    });

    it('falls back to a full Linear refresh when the lookup throws', async () => {
      const h = setup();
      await watchAll(h);
      h.linear.getIssueSummary.mockRejectedValue(
        new LinearError('network', 'offline')
      );
      h.fireIssue('uuid-1', 'COD-1');
      await settle();
      expect(h.linear.listOpen).toHaveBeenCalledTimes(2);
    });

    it('coalesces events of one issue into one lookup', async () => {
      const h = setup();
      await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      h.fireIssue('uuid-1');
      await vi.advanceTimersByTimeAsync(300);
      h.fireIssue('uuid-1');
      await vi.advanceTimersByTimeAsync(300);
      expect(h.linear.getIssueSummary).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(h.linear.getIssueSummary).toHaveBeenCalledTimes(1);

      h.fireIssue('uuid-2');
      await settle();
      expect(h.linear.getIssueSummary).toHaveBeenCalledTimes(2);
    });

    it('refreshes the details and comments of the issue when watched', async () => {
      const h = setup();
      await watchAll(h);
      h.adapter.watchTool(
        'Linear',
        'get_issue',
        { id: 'COD-1' },
        () => undefined
      );
      h.adapter.watchTool(
        'Linear',
        'list_comments',
        { issueId: 'COD-1' },
        () => undefined
      );
      await vi.advanceTimersByTimeAsync(0);
      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      h.fireIssue('uuid-1');
      await settle();
      expect(h.linear.getIssue).toHaveBeenCalledTimes(2);
      expect(h.linear.listComments).toHaveBeenCalledTimes(2);
    });

    it('drops the cached details and comments that cached calls read', async () => {
      const h = setup();
      await watchAll(h);
      const staleTime = { cache: { staleTime: 60_000 } };
      const read = () =>
        Promise.all([
          h.adapter.callTool('Linear', 'get_issue', { id: 'COD-1' }, staleTime),
          h.adapter.callTool(
            'Linear',
            'list_comments',
            { issueId: 'COD-1' },
            staleTime
          )
        ]);
      await read();
      await read();
      expect(h.linear.getIssue).toHaveBeenCalledTimes(1);

      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      h.fireIssue('uuid-1');
      await settle();
      await read();
      expect(h.linear.getIssue).toHaveBeenCalledTimes(2);
      expect(h.linear.listComments).toHaveBeenCalledTimes(2);
    });

    it('follows up a list fetch that was in flight during the patch', async () => {
      const h = setup();
      await watchAll(h);
      h.linear.getIssueSummary.mockResolvedValue(summaryOf('COD-1', 'started'));
      const refreshing = h.adapter.invalidate('Linear');
      h.fireIssue('uuid-1');
      await settle();
      await refreshing;
      expect(h.linear.listOpen.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('does nothing after stop', async () => {
      const h = setup();
      await watchAll(h);
      h.fireIssue('uuid-1');
      h.adapter.stop();
      await settle();
      expect(h.linear.getIssueSummary).not.toHaveBeenCalled();
    });
  });

  it('refreshes the watched Linear lists on every join', async () => {
    const { adapter, linear, fireStatus } = setup();
    watchOpen(adapter);
    await vi.advanceTimersByTimeAsync(0);

    fireStatus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);

    fireStatus(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(2);
    fireStatus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(linear.listOpen).toHaveBeenCalledTimes(3);
  });

  it('reports the channel health through onLive', async () => {
    const { onLive, fireStatus } = setup();
    expect(onLive.mock.calls.map(([live]) => live)).toEqual([false]);
    fireStatus(true);
    fireStatus(true);
    fireStatus(false);
    expect(onLive.mock.calls.map(([live]) => live)).toEqual([
      false,
      true,
      false
    ]);
  });

  it('records the retries and since when the channel has been up', async () => {
    const { onLive, fireStatus } = setup();
    const up = Date.now();
    expect(onLive.mock.calls[0][1]).toEqual({ retries: 0, upSince: null });
    fireStatus(true);
    expect(onLive.mock.calls[1][1]).toEqual({ retries: 0, upSince: up });
    fireStatus(false);
    expect(onLive.mock.calls[2][1]).toEqual({ retries: 1, upSince: null });
    await vi.advanceTimersByTimeAsync(5000);
    fireStatus(true);
    expect(onLive.mock.calls[3][1]).toEqual({
      retries: 1,
      upSince: up + 5000
    });
  });

  describe('github events and sessions', () => {
    const event = (subject: string, at: string): GithubEventRow => ({
      subject,
      pr: 1,
      action: 'opened',
      updated_at: at
    });

    it('replaces the row of a subject and puts the new one first', async () => {
      const { adapter, supabase, fireGithub } = setup();
      supabase.readGithubEvents.mockResolvedValueOnce([
        event('pr-1', '2026-10-28T10:00:00.000Z'),
        event('pr-2', '2026-10-28T09:00:00.000Z')
      ]);
      const events: WatchEvent[] = [];
      adapter.watchTool('Supabase', 'githubEvents', {}, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(0);

      fireGithub(event('pr-2', '2026-10-28T11:00:00.000Z'));
      expect(events.at(-1)).toMatchObject({
        type: 'data',
        result: {
          payload: [
            event('pr-2', '2026-10-28T11:00:00.000Z'),
            event('pr-1', '2026-10-28T10:00:00.000Z')
          ]
        }
      });
      expect(supabase.readGithubEvents).toHaveBeenCalledTimes(1);
    });

    it('keeps at most 200 rows', async () => {
      const { adapter, supabase, fireGithub } = setup();
      supabase.readGithubEvents.mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, i) =>
          event(`pr-${i}`, '2026-10-28T10:00:00.000Z')
        )
      );
      const events: WatchEvent<GithubEventRow[]>[] = [];
      adapter.watchTool('Supabase', 'githubEvents', {}, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(0);

      fireGithub(event('new', '2026-10-28T11:00:00.000Z'));
      const last = events.at(-1);
      const rows = last?.type === 'data' ? last.result.payload : [];
      expect(rows).toHaveLength(200);
      expect(rows[0].subject).toBe('new');
      expect(rows.at(-1)?.subject).toBe('pr-198');
    });

    it('does nothing for a github event before the first load', () => {
      const { fireGithub, supabase } = setup();
      fireGithub(event('pr-1', '2026-10-28T11:00:00.000Z'));
      expect(supabase.readGithubEvents).not.toHaveBeenCalled();
    });

    it('rereads sessions only when watched', async () => {
      const { adapter, supabase, fireSessions } = setup();
      fireSessions();
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.readSessions).not.toHaveBeenCalled();

      adapter.watchTool('Supabase', 'sessions', {}, () => undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.readSessions).toHaveBeenCalledTimes(1);

      fireSessions();
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.readSessions).toHaveBeenCalledTimes(2);
      expect(supabase.read).not.toHaveBeenCalled();
    });
  });
});
