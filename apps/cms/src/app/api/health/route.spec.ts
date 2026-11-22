/** @jest-environment node */
import * as Sentry from '@sentry/nextjs';
import { getPayload } from 'payload';

import {
  BOOT_QUIET_S,
  GET,
  HEALTH_DEADLINE_MS,
  resetHealthState
} from './route';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('payload', () => ({ getPayload: jest.fn() }));
jest.mock('../../../payload.config', () => ({}));

const pool = {
  query: jest.fn(),
  totalCount: 4,
  idleCount: 0,
  waitingCount: 7
};

const never = () => new Promise<never>(() => undefined);

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/health', { headers });

const caller = { health_caller: 'none', health_proxied: false };

beforeEach(() => {
  jest.resetAllMocks();
  jest.useRealTimers();
  resetHealthState();
  jest.spyOn(process, 'uptime').mockReturnValue(BOOT_QUIET_S + 60);
  jest.mocked(getPayload).mockResolvedValue({ db: { pool } } as never);
  pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('answers 200 when the query answers', async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Pong!');
    expect(pool.query).toHaveBeenCalledWith({
      text: 'SELECT 1',
      query_timeout: HEALTH_DEADLINE_MS
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('answers 503 when the query fails, and reports the pool', async () => {
    pool.query.mockRejectedValue(new Error('connection terminated'));

    const res = await GET(request());

    expect(res.status).toBe(503);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'connection terminated' }),
      expect.objectContaining({
        fingerprint: ['cms-health-check-failed'],
        tags: { health_step: 'query', health_timeout: false, ...caller },
        extra: {
          poolTotal: 4,
          poolIdle: 0,
          poolWaiting: 7,
          uptimeSeconds: BOOT_QUIET_S + 60
        }
      })
    );
  });

  it('answers 503 at the deadline when the query hangs', async () => {
    jest.useFakeTimers();
    pool.query.mockImplementation(never);

    const pending = GET(request());
    await jest.advanceTimersByTimeAsync(HEALTH_DEADLINE_MS);
    const res = await pending;

    expect(res.status).toBe(503);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'DeadlineError' }),
      expect.objectContaining({
        tags: { health_step: 'query', health_timeout: true, ...caller }
      })
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports once per run of failures, and again after a success', async () => {
    pool.query.mockRejectedValue(new Error('connection terminated'));
    await GET(request());
    await GET(request());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    pool.query.mockResolvedValue({ rows: [] });
    expect((await GET(request())).status).toBe(200);

    pool.query.mockRejectedValue(new Error('connection terminated'));
    expect((await GET(request())).status).toBe(503);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('answers 503 at the deadline when Payload never starts', async () => {
    jest.useFakeTimers();
    jest.mocked(getPayload).mockImplementation(never);

    const pending = GET(request());
    await jest.advanceTimersByTimeAsync(HEALTH_DEADLINE_MS);
    const res = await pending;

    expect(res.status).toBe(503);
    expect(pool.query).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { health_step: 'init', health_timeout: true, ...caller },
        extra: {
          poolTotal: undefined,
          poolIdle: undefined,
          poolWaiting: undefined,
          uptimeSeconds: BOOT_QUIET_S + 60
        }
      })
    );
  });

  it("reports who asked: the user agent, and whether Fly's proxy forwarded it", async () => {
    pool.query.mockRejectedValue(new Error('connection terminated'));

    await GET(
      request({ 'user-agent': 'Consul Health Check', 'fly-request-id': 'r1' })
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          health_step: 'query',
          health_timeout: false,
          health_caller: 'Consul Health Check',
          health_proxied: true
        }
      })
    );
  });

  it('keeps a miss during the boot out of Sentry, but still answers 503', async () => {
    jest.mocked(process.uptime).mockReturnValue(BOOT_QUIET_S - 1);
    pool.query.mockRejectedValue(new Error('connection terminated'));

    expect((await GET(request())).status).toBe(503);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a failure after the first 200, even within the boot window', async () => {
    jest.mocked(process.uptime).mockReturnValue(BOOT_QUIET_S - 60);
    expect((await GET(request())).status).toBe(200);

    pool.query.mockRejectedValue(new Error('connection terminated'));
    await GET(request());

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('cuts the caller to 64 characters, and reads an empty one as none', async () => {
    pool.query.mockRejectedValue(new Error('connection terminated'));
    await GET(request({ 'user-agent': 'x'.repeat(100) }));
    pool.query.mockResolvedValue({ rows: [] });
    await GET(request());
    pool.query.mockRejectedValue(new Error('connection terminated'));
    await GET(request({ 'user-agent': '' }));

    const callers = jest
      .mocked(Sentry.captureException)
      .mock.calls.map(
        ([, hint]) =>
          (hint as { tags: Record<string, unknown> }).tags['health_caller']
      );
    expect(callers).toEqual(['x'.repeat(64), 'none']);
  });

  it('reports a failure that lasts past the boot', async () => {
    pool.query.mockRejectedValue(new Error('connection terminated'));
    jest.mocked(process.uptime).mockReturnValue(BOOT_QUIET_S - 1);
    await GET(request());

    jest.mocked(process.uptime).mockReturnValue(BOOT_QUIET_S);
    await GET(request());

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('clears its timer once answered', async () => {
    jest.useFakeTimers();

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(jest.getTimerCount()).toBe(0);
  });
});
