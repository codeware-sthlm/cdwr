import type { BasePayload } from 'payload';

import {
  type OpenJob,
  type WaitingComponent,
  recoverComponentBuilds,
  staleComponentBuildIds
} from './recover-component-builds';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));

const now = new Date('2026-01-01T12:00:00.000Z');
const ago = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

const component = (
  id: number,
  minutes: number,
  status: 'pending' | 'building' | 'ready' | 'failed' = 'building',
  diagnostics?: unknown
): WaitingComponent => ({
  id,
  updatedAt: ago(minutes),
  build: { status, diagnostics }
});

const finding = (transient?: true) => ({
  message: 'm',
  line: 1,
  column: 1,
  severity: 'error',
  ...(transient && { transient })
});

const job = (id: number, overrides: Partial<OpenJob> = {}): OpenJob => ({
  taskSlug: 'build-custom-component',
  input: { id },
  ...overrides
});

describe('staleComponentBuildIds', () => {
  it('skips components younger than the threshold', () => {
    expect(staleComponentBuildIds([component(1, 4)], [], { now })).toEqual([]);
    expect(staleComponentBuildIds([component(1, 5)], [], { now })).toEqual([1]);
  });

  it('skips a component with a runnable job', () => {
    expect(
      staleComponentBuildIds([component(1, 30)], [job(1)], { now })
    ).toEqual([]);
  });

  it('ignores errored and completed jobs', () => {
    expect(
      staleComponentBuildIds(
        [component(1, 30), component(2, 30)],
        [job(1, { hasError: true }), job(2, { completedAt: ago(10) })],
        { now }
      )
    ).toEqual([1, 2]);
  });

  it('ignores jobs for other components or tasks', () => {
    expect(
      staleComponentBuildIds(
        [component(1, 30)],
        [job(2), job(1, { taskSlug: 'anonymize-tour-signups' })],
        { now }
      )
    ).toEqual([1]);
  });

  it('returns a component with no job, pending or building', () => {
    expect(
      staleComponentBuildIds(
        [component(1, 30, 'pending'), component(2, 30, 'building')],
        [],
        { now }
      )
    ).toEqual([1, 2]);
  });

  it('leaves built components alone', () => {
    expect(
      staleComponentBuildIds(
        [component(1, 30, 'ready'), component(2, 30, 'failed')],
        [],
        { now }
      )
    ).toEqual([]);
  });

  it('retries a failed build whose diagnostics are transient', () => {
    expect(
      staleComponentBuildIds(
        [
          component(1, 30, 'failed', [finding(true)]),
          component(2, 30, 'failed', [finding()]),
          component(3, 30, 'failed', [finding(), finding(true)])
        ],
        [],
        { now }
      )
    ).toEqual([1, 3]);
  });

  it('gives a just-failed transient build time, and respects a runnable job', () => {
    expect(
      staleComponentBuildIds(
        [
          component(1, 4, 'failed', [finding(true)]),
          component(2, 30, 'failed', [finding(true)])
        ],
        [job(2)],
        { now }
      )
    ).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an object', { transient: true }],
    ['a string', 'transient'],
    ['entries that are not findings', [{ transient: true }]]
  ])('counts malformed diagnostics (%s) as none', (_label, diagnostics) => {
    expect(
      staleComponentBuildIds([component(1, 30, 'failed', diagnostics)], [], {
        now
      })
    ).toEqual([]);
  });
});

describe('recoverComponentBuilds', () => {
  const setup = (
    components: WaitingComponent[],
    jobs: OpenJob[],
    remaining = 0
  ) => {
    const find = jest
      .fn()
      .mockResolvedValueOnce({ docs: components })
      .mockResolvedValueOnce({ docs: jobs });
    const update = jest
      .fn()
      .mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] });
    const queue = jest.fn().mockResolvedValue({ id: 99 });
    let left = remaining;
    const run = jest.fn().mockImplementation(async () => {
      left = Math.max(left - 1, 0);
      return { noJobsRemaining: left === 0 };
    });
    const logger = { info: jest.fn(), error: jest.fn() };
    const payload = {
      find,
      update,
      jobs: { queue, run },
      logger
    } as unknown as BasePayload;
    return { payload, find, update, queue, run, logger };
  };

  afterEach(() => jest.useRealTimers());

  it('queues one build per stale component, then drains the queue', async () => {
    jest.useFakeTimers({ now });
    const { payload, queue, run, update } = setup(
      [component(1, 30), component(2, 30), component(3, 1)],
      [job(2)],
      3
    );

    await recoverComponentBuilds(payload, { boot: false });

    expect(update).not.toHaveBeenCalled();
    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith({
      task: 'build-custom-component',
      input: { id: 1 },
      queue: 'component-builds'
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenCalledWith({ queue: 'component-builds', limit: 1 });
  });

  it('retries a failed build and says why', async () => {
    jest.useFakeTimers({ now });
    const { payload, queue, logger } = setup(
      [component(1, 30, 'failed', [finding(true)])],
      []
    );

    await recoverComponentBuilds(payload, { boot: false });

    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({ input: { id: 1 } })
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[componentBuilds] Retrying component 1: the last build failed on its circumstances'
    );
  });

  it('releases claimed jobs at boot, before anything else', async () => {
    const { payload, update, logger } = setup([], []);

    await recoverComponentBuilds(payload, { boot: true });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-jobs',
        data: { processing: false }
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Released 2')
    );
  });

  it('stops draining when the queue is empty', async () => {
    const { payload, run } = setup([], [], 0);

    await recoverComponentBuilds(payload, { boot: false });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('logs an error instead of throwing', async () => {
    const { payload, find, logger } = setup([], []);
    find.mockReset().mockRejectedValue(new Error('db down'));

    await expect(
      recoverComponentBuilds(payload, { boot: false })
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
