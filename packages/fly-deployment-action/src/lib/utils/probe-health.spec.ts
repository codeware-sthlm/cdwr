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

  beforeEach(() => {
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

    const reason = await probeHealth('https://app.fly.dev', '/api/health');

    expect(reason).toContain('answered 503');
    expect(reason).toContain('https://app.fly.dev/api/health');
  });

  it('should return a timeout reason when the request times out', async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    mockFetch.mockRejectedValue(error);

    const reason = await probeHealth('https://app.fly.dev', '/api/health');

    expect(reason).toContain('could not be reached');
    expect(reason).toContain('no answer within 60s');
  });

  it('should include the message of a network error', async () => {
    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND app.fly.dev'));

    const reason = await probeHealth('https://app.fly.dev', '/api/health');

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
});
