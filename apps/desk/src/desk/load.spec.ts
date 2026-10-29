import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdapter } from '../data';
import type { Issue, IssueDetail } from '../linear';
import { toRuns } from '../supabase';

import { createLoader } from './load';
import { createState } from './state';

const issue = (id: string, labels: string[] = []): Issue => ({
  id,
  title: id,
  priority: { value: 2 },
  status: 'x',
  statusType: 'started',
  labels,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  url: `https://linear.app/${id}`,
  completedAt: null,
  canceledAt: null
});

const detail: IssueDetail = {
  description: '',
  relations: { blockedBy: [] },
  attachments: []
};

const setup = (getIssue: (id: string) => Promise<IssueDetail>) => {
  const linear = {
    listOpen: vi.fn(() =>
      Promise.resolve({
        triage: [],
        backlog: [],
        unstarted: [],
        started: [issue('COD-1', ['agent:ready'])]
      })
    ),
    listIdeas: vi.fn(() => Promise.resolve([])),
    listClosed: vi.fn(() => Promise.resolve([])),
    getIssue: vi.fn(getIssue),
    getIssueSummary: vi.fn(() => Promise.resolve(null)),
    listComments: vi.fn(() => Promise.resolve({ comments: [] }))
  };
  const supabase = {
    read: vi.fn(() =>
      Promise.resolve({
        runs: toRuns([], []),
        usage: {
          updated: '',
          windowDays: 30,
          total: 0,
          pricesDate: '',
          unpriced: [],
          models: [],
          days: [],
          tickets: []
        },
        activity: null
      })
    ),
    subscribe: vi.fn(() => () => undefined)
  };
  const adapter = createAdapter({
    linear,
    supabase,
    events: { onFocus: () => () => undefined }
  });
  const state = createState();
  const render = vi.fn();
  const loader = createLoader({ adapter, state, render });
  return { adapter, linear, state, render, loader };
};

// Lets the watches answer and the details timer fire
const settle = () => vi.advanceTimersByTimeAsync(1000);

describe('createLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the details of the agent tickets', async () => {
    const { loader, state, render } = setup(() => Promise.resolve(detail));
    loader.watchAll();
    await settle();
    expect(state.details.has('COD-1')).toBe(true);
    expect(render).toHaveBeenCalled();
    loader.stop();
  });

  it('writes nothing once stopped, even for an answer on its way', async () => {
    let answer: (d: IssueDetail) => void = () => undefined;
    const { loader, state, render, linear } = setup(
      () => new Promise((resolve) => (answer = resolve))
    );
    loader.watchAll();
    await settle();
    expect(linear.getIssue).toHaveBeenCalledWith('COD-1');
    loader.stop();
    const renders = render.mock.calls.length;
    answer(detail);
    await settle();
    expect(state.details.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(renders);
  });

  it('drops a failure that arrives after stop', async () => {
    let fail: (e: Error) => void = () => undefined;
    const { loader, state, render } = setup(
      () => new Promise((_resolve, reject) => (fail = reject))
    );
    loader.watchAll();
    await settle();
    loader.stop();
    const renders = render.mock.calls.length;
    fail(new Error('late'));
    await settle();
    expect(state.errors.has('detail:COD-1')).toBe(false);
    expect(render).toHaveBeenCalledTimes(renders);
  });

  it('ignores watch events after stop', async () => {
    const { loader, state, render, adapter } = setup(() =>
      Promise.resolve(detail)
    );
    loader.watchAll();
    await settle();
    loader.stop();
    state.data.buckets.clear();
    const renders = render.mock.calls.length;
    await adapter.invalidate('Linear');
    await settle();
    expect(state.data.buckets.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(renders);
  });

  it('refresh after stop writes nothing', async () => {
    const { loader, state, render } = setup(() => Promise.resolve(detail));
    loader.watchAll();
    await settle();
    loader.stop();
    state.details.clear();
    const renders = render.mock.calls.length;
    await loader.refresh();
    expect(state.details.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(renders);
  });

  it('drops the errors of tickets no longer requested on the next load', async () => {
    const { loader, state, adapter } = setup(() => Promise.resolve(detail));
    loader.watchAll();
    await settle();
    const failure = { code: 'network', message: 'x' };
    state.errors.set('detail:COD-9', failure);
    state.errors.set('handoffs:COD-9', failure);
    state.errors.set('reason:COD-9', failure);
    state.errors.set('runs', failure);
    await adapter.invalidate('Linear');
    await settle();
    expect([...state.errors.keys()]).toEqual(['runs']);
    loader.stop();
  });

  it('drops what a superseded load answers', async () => {
    let fail: (e: Error) => void = () => undefined;
    const { loader, state, adapter, linear } = setup(
      () => new Promise((_resolve, reject) => (fail = reject))
    );
    loader.watchAll();
    await settle();
    // COD-1 leaves the agent's tickets, so the next load no longer asks for it
    linear.listOpen.mockResolvedValue({
      triage: [],
      backlog: [],
      unstarted: [],
      started: [issue('COD-1')]
    });
    await adapter.invalidate('Linear');
    await settle();
    fail(new Error('late'));
    await settle();
    expect(state.errors.has('detail:COD-1')).toBe(false);
    loader.stop();
  });

  it('refresh clears the errors of per-ticket requests', async () => {
    const { loader, state } = setup(() => Promise.resolve(detail));
    loader.watchAll();
    await settle();
    const failure = { code: 'network', message: 'x' };
    state.errors.set('detail:COD-9', failure);
    state.errors.set('handoffs:COD-9', failure);
    state.errors.set('reason:COD-9', failure);
    state.errors.set('other', failure);
    await loader.refresh();
    expect([...state.errors.keys()]).toEqual(['other']);
    loader.stop();
  });
});
