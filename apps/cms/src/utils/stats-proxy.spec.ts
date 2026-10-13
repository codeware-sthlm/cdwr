/**
 * @jest-environment node
 */
import {
  CACHE_HEADER,
  CLIENT_IP_HEADER,
  MAX_BODY_BYTES,
  proxyStats,
  statsScript
} from './stats-proxy';

const UMAMI = 'https://umami.example';

const upstream = () =>
  jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    async () =>
      new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      })
  );

const send = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://site.example/stats/api/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body
  });

describe('proxyStats', () => {
  it('serves the script from Umami, cached for an hour', async () => {
    const fetchImpl = upstream();
    const response = await proxyStats({
      request: new Request('https://site.example/stats/script.js'),
      path: ['script.js'],
      umamiUrl: UMAMI,
      fetchImpl
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${UMAMI}/script.js`);
  });

  it('forwards a beacon with the visitor agent and address', async () => {
    const fetchImpl = upstream();
    const response = await proxyStats({
      request: send('{"type":"event"}', {
        'user-agent': 'Firefox',
        'fly-client-ip': '203.0.113.7'
      }),
      path: ['api', 'send'],
      umamiUrl: `${UMAMI}/`,
      fetchImpl
    });

    expect(response.status).toBe(200);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${UMAMI}/api/send`);
    expect(init?.body).toBe('{"type":"event"}');
    expect(init?.headers).toMatchObject({
      'user-agent': 'Firefox',
      [CLIENT_IP_HEADER]: '203.0.113.7'
    });
  });

  it('passes the tracker session token on, but not an oversized one', async () => {
    const forwarded = upstream();
    await proxyStats({
      request: send('{}', { [CACHE_HEADER]: 'eyJ.token' }),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl: forwarded
    });
    expect(forwarded.mock.calls[0]?.[1]?.headers).toMatchObject({
      [CACHE_HEADER]: 'eyJ.token'
    });

    const dropped = upstream();
    await proxyStats({
      request: send('{}', { [CACHE_HEADER]: 'x'.repeat(4096) }),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl: dropped
    });
    expect(dropped.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      CACHE_HEADER
    );
  });

  it.each([
    ['an unknown path', 'GET', ['api', 'websites']],
    ['the script by POST', 'POST', ['script.js']],
    ['the beacon by GET', 'GET', ['api', 'send']],
    ['a path walking out', 'GET', ['..', 'admin']]
  ])('refuses %s', async (_label, method, path) => {
    const fetchImpl = upstream();
    const response = await proxyStats({
      request: new Request(`https://site.example/stats/${path.join('/')}`, {
        method,
        ...(method === 'POST' ? { body: '{}' } : {})
      }),
      path,
      umamiUrl: UMAMI,
      fetchImpl
    });

    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('collects nothing without UMAMI_URL', async () => {
    const fetchImpl = upstream();
    const response = await proxyStats({
      request: send('{}'),
      path: ['api', 'send'],
      umamiUrl: undefined,
      fetchImpl
    });

    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await proxyStats({
      request: send('a=1', {
        'content-type': 'application/x-www-form-urlencoded'
      }),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl: upstream()
    });
    expect(response.status).toBe(415);
  });

  it('refuses a body over the cap', async () => {
    const response = await proxyStats({
      request: send(`"${'x'.repeat(MAX_BODY_BYTES)}"`),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl: upstream()
    });
    expect(response.status).toBe(413);
  });

  it('refuses a chunked body over the cap without a declared length', async () => {
    const big = new TextEncoder().encode(`"${'x'.repeat(MAX_BODY_BYTES)}"`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big.slice(0, 1024));
        controller.enqueue(big.slice(1024));
        controller.close();
      }
    });
    const request = new Request('https://site.example/stats/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error -- Node's fetch needs `duplex` for a stream body
      duplex: 'half'
    });
    const fetchImpl = upstream();
    const response = await proxyStats({
      request,
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl
    });
    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches the script only when Umami answered it', async () => {
    const response = await proxyStats({
      request: new Request('https://site.example/stats/script.js'),
      path: ['script.js'],
      umamiUrl: UMAMI,
      fetchImpl: jest.fn(async () => new Response('waking', { status: 503 }))
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 502 without detail when Umami is unreachable', async () => {
    const response = await proxyStats({
      request: send('{}'),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      fetchImpl: jest.fn(async () => {
        throw new Error('ECONNREFUSED 10.0.0.1');
      })
    });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('');
  });
});

describe('statsScript', () => {
  it('points the script and its beacon at /stats', () => {
    expect(
      statsScript({ umamiUrl: UMAMI, websiteId: 'site-1', nonce: 'n0nce' })
    ).toEqual({
      src: '/stats/script.js',
      'data-website-id': 'site-1',
      'data-host-url': '/stats',
      nonce: 'n0nce'
    });
  });

  it.each([
    ['no Umami', { umamiUrl: undefined, websiteId: 'site-1' }],
    ['no website id', { umamiUrl: UMAMI, websiteId: null }]
  ])('renders nothing with %s', (_label, settings) => {
    expect(statsScript({ ...settings, nonce: undefined })).toBeNull();
  });
});
