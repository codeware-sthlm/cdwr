import type { WorkflowRun } from '../../services/github';

import { type Clock, awaitLive, dispatchedRun } from './provision.wait';

const AT = Date.parse('2026-01-01T12:00:00Z');

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
  id: 2,
  status: 'completed',
  conclusion: 'success',
  event: 'workflow_dispatch',
  createdAt: new Date(AT + 1_000).toISOString(),
  url: 'https://gh/run/2',
  ...over
});

/** A clock that advances only by sleeping */
const fakeClock = (): Clock => {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    }
  };
};

const base = {
  dispatch: { known: new Set([1]), at: AT },
  healthUrl: 'https://cdwr-cms-acme.fly.dev/api/health'
};

describe('dispatchedRun', () => {
  const dispatch = { known: new Set([1]), at: AT };

  it('ignores a push run, a run before the dispatch and a known run', () => {
    const runs = [
      run({ id: 1 }),
      run({ id: 2, event: 'push' }),
      run({ id: 3, createdAt: new Date(AT - 120_000).toISOString() }),
      run({ id: 5 }),
      run({ id: 4 })
    ];
    expect(dispatchedRun(runs, dispatch)?.id).toBe(4);
  });

  it('allows for clock skew', () => {
    const early = run({
      id: 2,
      createdAt: new Date(AT - 10_000).toISOString()
    });
    expect(dispatchedRun([early], dispatch)?.id).toBe(2);
  });

  it('is undefined while the run has not appeared', () => {
    expect(dispatchedRun([run({ id: 2, event: 'push' })], dispatch)).toBe(
      undefined
    );
  });
});

describe('awaitLive', () => {
  it('is live when the run succeeded and the site answers', async () => {
    const result = await awaitLive({
      ...base,
      listRuns: async () => [run({ id: 1, conclusion: 'failure' }), run({})],
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
  });

  it('waits for a running run to complete', async () => {
    const listRuns = vi
      .fn<() => Promise<WorkflowRun[]>>()
      .mockResolvedValueOnce([run({ status: 'in_progress', conclusion: '' })])
      .mockResolvedValue([run({})]);
    const result = await awaitLive({
      ...base,
      listRuns,
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('skips the run when nothing was dispatched', async () => {
    const listRuns = vi.fn(async () => []);
    const result = await awaitLive({
      ...base,
      dispatch: undefined,
      listRuns,
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
    expect(listRuns).not.toHaveBeenCalled();
  });

  it('is not live when the run failed, and never checks the site', async () => {
    const check = vi.fn(async () => true);
    const result = await awaitLive({
      ...base,
      listRuns: async () => [run({ conclusion: 'failure' })],
      check,
      clock: fakeClock()
    });
    expect(result).toEqual({
      live: false,
      reason: 'the deployment run ended as failure (https://gh/run/2)'
    });
    expect(check).not.toHaveBeenCalled();
  });

  it('gives up when the run never finishes', async () => {
    const result = await awaitLive({
      ...base,
      listRuns: async () => [run({ status: 'in_progress', conclusion: '' })],
      check: async () => true,
      deployTimeoutMs: 120_000,
      clock: fakeClock()
    });
    expect(result).toEqual({
      live: false,
      reason: 'the deployment run did not finish within 2 minutes'
    });
  });

  it('gives up when the site never answers', async () => {
    const check = vi.fn(async () => false);
    const result = await awaitLive({
      ...base,
      listRuns: async () => [run({})],
      check,
      healthTimeoutMs: 60_000,
      clock: fakeClock()
    });
    expect(result.live).toBe(false);
    expect(check.mock.calls.length).toBeGreaterThan(1);
  });

  it('is live once the site starts answering', async () => {
    const check = vi
      .fn<(url: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const result = await awaitLive({
      ...base,
      listRuns: async () => [run({})],
      check,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
  });
});
