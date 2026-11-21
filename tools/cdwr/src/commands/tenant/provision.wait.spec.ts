import type { WorkflowRun } from '../../services/github';

import { type Clock, awaitLive } from './provision.wait';

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
  id: 2,
  status: 'completed',
  conclusion: 'success',
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
  runId: 2,
  healthUrl: 'https://cdwr-cms-acme.fly.dev/api/health'
};

describe('awaitLive', () => {
  it('polls the named run and is live when it succeeded and the site answers', async () => {
    const result = await awaitLive({
      ...base,
      getRun: async () => run({}),
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
  });

  it('waits for a running run to complete', async () => {
    const getRun = vi
      .fn<() => Promise<WorkflowRun>>()
      .mockResolvedValueOnce(run({ status: 'in_progress', conclusion: '' }))
      .mockResolvedValue(run({}));
    const result = await awaitLive({
      ...base,
      getRun,
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
    expect(getRun).toHaveBeenCalledTimes(2);
  });

  it('skips the run when nothing was dispatched', async () => {
    const getRun = vi.fn(async () => run({}));
    const result = await awaitLive({
      ...base,
      runId: undefined,
      getRun,
      check: async () => true,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
    expect(getRun).not.toHaveBeenCalled();
  });

  it('is not live when the run failed, and never checks the site', async () => {
    const check = vi.fn(async () => true);
    const result = await awaitLive({
      ...base,
      getRun: async () => run({ conclusion: 'failure' }),
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
      getRun: async () => run({ status: 'in_progress', conclusion: '' }),
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
      getRun: async () => run({}),
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
      getRun: async () => run({}),
      check,
      clock: fakeClock()
    });
    expect(result).toEqual({ live: true });
  });
});
