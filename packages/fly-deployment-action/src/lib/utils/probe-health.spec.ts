import { getHealthCheckPath, probeHealth } from './probe-health';

describe('getHealthCheckPath', () => {
  it('should return the path of the first check', () => {
    expect(
      getHealthCheckPath({
        checks: [{ path: '/api/health' }, { path: '/other' }]
      })
    ).toBe('/api/health');
  });

  it('should return undefined for an empty checks array', () => {
    expect(getHealthCheckPath({ checks: [] })).toBeUndefined();
  });

  it('should return undefined without checks', () => {
    expect(getHealthCheckPath({})).toBeUndefined();
  });

  it('should return undefined without an http service', () => {
    expect(getHealthCheckPath(undefined)).toBeUndefined();
  });

  it('should return undefined when the path is not a string', () => {
    expect(getHealthCheckPath({ checks: [{ path: 42 }] })).toBeUndefined();
    expect(getHealthCheckPath({ checks: [{}] })).toBeUndefined();
  });
});

describe('probeHealth', () => {
  const mockFetch = vi.fn();

  /** Fake clock: sleeping advances time, nothing really waits */
  let clock = 0;
  const fast = {
    budgetMs: 20_000,
    intervalMs: 5_000,
    sleep: async (ms: number) => {
      clock += ms;
    },
    now: () => clock
  };

  beforeEach(() => {
    clock = 0;
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return null when the app answers 200', async () => {
    mockFetch.mockResolvedValue({ status: 200 });

    await expect(
      probeHealth('https://app.fly.dev', '/api/health')
    ).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://app.fly.dev/api/health',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('should return the status when the app does not answer 200', async () => {
    mockFetch.mockResolvedValue({ status: 503 });

    const reason = await probeHealth(
      'https://app.fly.dev',
      '/api/health',
      fast
    );

    expect(reason).toContain('answered 503');
    expect(reason).toContain('https://app.fly.dev/api/health');
  });

  it('should return at once on a non-transient status', async () => {
    mockFetch.mockResolvedValue({ status: 404 });

    const reason = await probeHealth(
      'https://app.fly.dev',
      '/api/health',
      fast
    );

    expect(reason).toBe('https://app.fly.dev/api/health answered 404');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should retry a 502 until the app answers 200', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200 });

    await expect(
      probeHealth('https://app.fly.dev', '/api/health', fast)
    ).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should return a timeout reason when the request times out', async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    mockFetch.mockRejectedValue(error);

    const reason = await probeHealth(
      'https://app.fly.dev',
      '/api/health',
      fast
    );

    expect(reason).toContain('could not be reached');
    expect(reason).toContain('no answer within');
  });

  it('should include the message of a network error', async () => {
    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND app.fly.dev'));

    const reason = await probeHealth(
      'https://app.fly.dev',
      '/api/health',
      fast
    );

    expect(reason).toContain('could not be reached');
    expect(reason).toContain('getaddrinfo ENOTFOUND app.fly.dev');
  });

  it('should join a url with a trailing slash and a path without one', async () => {
    mockFetch.mockResolvedValue({ status: 200 });

    await probeHealth('https://app.fly.dev/', 'health');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://app.fly.dev/health',
      expect.anything()
    );
  });

  it('should not double the slash for a trailing slash url and a leading slash path', async () => {
    mockFetch.mockResolvedValue({ status: 200 });

    await probeHealth('https://app.fly.dev/', '/health');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://app.fly.dev/health',
      expect.anything()
    );
  });

  it('should retry until the app answers 200', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });

    await expect(
      probeHealth('https://app.fly.dev', '/api/health', fast)
    ).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry after a network error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200 });

    await expect(
      probeHealth('https://app.fly.dev', '/api/health', fast)
    ).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should give up with the last reason when the budget runs out', async () => {
    mockFetch.mockResolvedValue({ status: 503 });

    const reason = await probeHealth(
      'https://app.fly.dev',
      '/api/health',
      fast
    );

    expect(reason).toContain('no 200 within 20s');
    expect(reason).toContain('answered 503');
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
  });
});
