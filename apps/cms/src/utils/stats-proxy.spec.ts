/**
 * @jest-environment node
 */
import {
  CACHE_HEADER,
  CLIENT_IP_HEADER,
  MAX_BODY_BYTES,
  MAX_RECORD_BYTES,
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

const ID = '0b7a3c9e-5d1f-4e2a-9c8b-1a2b3c4d5e6f';
const OTHER_ID = '9f8e7d6c-5b4a-4321-8fed-cba987654321';

const site = (id: string | null = ID) =>
  jest.fn<Promise<string | null>, []>(async () => id);

const heatmap = (website: string) =>
  JSON.stringify({ type: 'heatmap', payload: { website, events: [] } });

const record = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://site.example/stats/api/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body
  });

const send = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://site.example/stats/api/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body
  });

describe('proxyStats', () => {
  it('serves the script from Umami, cached for an hour', async () => {
    const fetchImpl = upstream();
    const websiteId = site();
    const response = await proxyStats({
      request: new Request('https://site.example/stats/script.js'),
      path: ['script.js'],
      umamiUrl: UMAMI,
      websiteId,
      fetchImpl
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${UMAMI}/script.js`);
    expect(websiteId).not.toHaveBeenCalled();
  });

  it('serves the recorder from Umami, cached for an hour', async () => {
    const fetchImpl = upstream();
    const websiteId = site();
    const response = await proxyStats({
      request: new Request('https://site.example/stats/recorder.js'),
      path: ['recorder.js'],
      umamiUrl: UMAMI,
      websiteId,
      fetchImpl
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${UMAMI}/recorder.js`);
    expect(websiteId).not.toHaveBeenCalled();
  });

  it('forwards a beacon with the visitor agent and address', async () => {
    const fetchImpl = upstream();
    const websiteId = site();
    const response = await proxyStats({
      request: send('{"type":"event"}', {
        'user-agent': 'Firefox',
        'fly-client-ip': '203.0.113.7'
      }),
      path: ['api', 'send'],
      umamiUrl: `${UMAMI}/`,
      websiteId,
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
    expect(websiteId).not.toHaveBeenCalled();
  });

  it('passes the tracker session token on, but not an oversized one', async () => {
    const forwarded = upstream();
    await proxyStats({
      request: send('{}', { [CACHE_HEADER]: 'eyJ.token' }),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      websiteId: site(),
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
      websiteId: site(),
      fetchImpl: dropped
    });
    expect(dropped.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      CACHE_HEADER
    );
  });

  it.each([
    ['an unknown path', 'GET', ['api', 'websites']],
    ['the script by POST', 'POST', ['script.js']],
    ['the recorder by POST', 'POST', ['recorder.js']],
    ['the beacon by GET', 'GET', ['api', 'send']],
    ['the heatmap endpoint by GET', 'GET', ['api', 'record']],
    ['the settings by POST', 'POST', ['api', 'websites', ID, 'recorder']],
    [
      'settings for a non-UUID id',
      'GET',
      ['api', 'websites', 'abc', 'recorder']
    ],
    [
      'settings with an extra segment',
      'GET',
      ['api', 'websites', ID, 'recorder', 'x']
    ],
    ['settings for another resource', 'GET', ['api', 'websites', ID, 'stats']],
    ['a path walking out', 'GET', ['..', 'admin']],
    ['settings walking out', 'GET', ['api', 'websites', ID, 'recorder', '..']]
  ])('refuses %s', async (_label, method, path) => {
    const fetchImpl = upstream();
    const websiteId = site();
    const response = await proxyStats({
      request: new Request(`https://site.example/stats/${path.join('/')}`, {
        method,
        ...(method === 'POST' ? { body: '{}' } : {})
      }),
      path,
      umamiUrl: UMAMI,
      websiteId,
      fetchImpl
    });

    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(websiteId).not.toHaveBeenCalled();
  });

  it('collects nothing without UMAMI_URL', async () => {
    const fetchImpl = upstream();
    const response = await proxyStats({
      request: send('{}'),
      path: ['api', 'send'],
      umamiUrl: undefined,
      websiteId: site(),
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
      websiteId: site(),
      fetchImpl: upstream()
    });
    expect(response.status).toBe(415);
  });

  it('refuses a body over the cap', async () => {
    const response = await proxyStats({
      request: send(`"${'x'.repeat(MAX_BODY_BYTES)}"`),
      path: ['api', 'send'],
      umamiUrl: UMAMI,
      websiteId: site(),
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
      websiteId: site(),
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
      websiteId: site(),
      fetchImpl: jest.fn(async () => new Response('waking', { status: 503 }))
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('caches the recorder only when Umami answered it', async () => {
    const response = await proxyStats({
      request: new Request('https://site.example/stats/recorder.js'),
      path: ['recorder.js'],
      umamiUrl: UMAMI,
      websiteId: site(),
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
      websiteId: site(),
      fetchImpl: jest.fn(async () => {
        throw new Error('ECONNREFUSED 10.0.0.1');
      })
    });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('');
  });

  describe('recorder settings', () => {
    const settings = (id: string) =>
      new Request(`https://site.example/stats/api/websites/${id}/recorder`);

    const umamiSettings = () =>
      jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
        Response.json({
          heatmapEnabled: true,
          heatmapSampleRate: 0.15,
          replayEnabled: true
        })
      );

    it('passes the own website through, replay switched off', async () => {
      const fetchImpl = umamiSettings();
      const response = await proxyStats({
        request: settings(ID),
        path: ['api', 'websites', ID, 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, max-age=60');
      expect(await response.json()).toEqual({
        heatmapEnabled: true,
        heatmapSampleRate: 0.15,
        replayEnabled: false
      });
      expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
        `${UMAMI}/api/websites/${ID}/recorder`
      );
    });

    it('matches the id case-insensitively', async () => {
      const fetchImpl = umamiSettings();
      const response = await proxyStats({
        request: settings(ID.toUpperCase()),
        path: ['api', 'websites', ID.toUpperCase(), 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('refuses another website', async () => {
      const fetchImpl = umamiSettings();
      const response = await proxyStats({
        request: settings(OTHER_ID),
        path: ['api', 'websites', OTHER_ID, 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('answers 404 when the tenant has no website', async () => {
      const fetchImpl = umamiSettings();
      const response = await proxyStats({
        request: settings(ID),
        path: ['api', 'websites', ID, 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(null),
        fetchImpl
      });

      expect(response.status).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('passes an upstream error on, uncached', async () => {
      const response = await proxyStats({
        request: settings(ID),
        path: ['api', 'websites', ID, 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl: jest.fn<Promise<Response>, Parameters<typeof fetch>>(
          async () => new Response('down', { status: 503 })
        )
      });

      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    });

    it('answers 502 when Umami answers something other than settings', async () => {
      const response = await proxyStats({
        request: settings(ID),
        path: ['api', 'websites', ID, 'recorder'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl: upstream()
      });

      expect(response.status).toBe(502);
    });
  });
  describe('heatmap batches', () => {
    it('forwards a heatmap for the own website unchanged', async () => {
      const fetchImpl = upstream();
      const body = heatmap(ID);
      const response = await proxyStats({
        request: record(body, {
          'user-agent': 'Firefox',
          'fly-client-ip': '203.0.113.7',
          [CACHE_HEADER]: 'eyJ.token'
        }),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(200);
      const [url, init] = fetchImpl.mock.calls[0] ?? [];
      expect(String(url)).toBe(`${UMAMI}/api/record`);
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(body);
      expect(init?.headers).toMatchObject({
        'user-agent': 'Firefox',
        [CLIENT_IP_HEADER]: '203.0.113.7',
        [CACHE_HEADER]: 'eyJ.token'
      });
    });

    it('refuses session replay', async () => {
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record(
          JSON.stringify({ type: 'record', payload: { website: ID } })
        ),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a heatmap for another website', async () => {
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record(heatmap(OTHER_ID)),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('answers 404 when the tenant has no website', async () => {
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record(heatmap(ID)),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(null),
        fetchImpl
      });

      expect(response.status).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a body that is not valid JSON', async () => {
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record('{nope'),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a body that is not JSON by content type', async () => {
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record(heatmap(ID), { 'content-type': 'text/plain' }),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(415);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('takes a heatmap batch larger than a beacon', async () => {
      const fetchImpl = upstream();
      const body = JSON.stringify({
        type: 'heatmap',
        payload: { website: ID, url: 'x'.repeat(MAX_BODY_BYTES) }
      });
      const response = await proxyStats({
        request: record(body),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl
      });

      expect(response.status).toBe(200);
      expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(body);
    });

    it('refuses a body over the cap before reading the tenant', async () => {
      const websiteId = site();
      const fetchImpl = upstream();
      const response = await proxyStats({
        request: record(`"${'x'.repeat(MAX_RECORD_BYTES)}"`),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId,
        fetchImpl
      });

      expect(response.status).toBe(413);
      expect(websiteId).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('answers 502 without detail when Umami is unreachable', async () => {
      const response = await proxyStats({
        request: record(heatmap(ID)),
        path: ['api', 'record'],
        umamiUrl: UMAMI,
        websiteId: site(),
        fetchImpl: jest.fn(async () => {
          throw new Error('ECONNREFUSED 10.0.0.1');
        })
      });

      expect(response.status).toBe(502);
      expect(await response.text()).toBe('');
    });
  });
});

describe('statsScript', () => {
  it('points the scripts and their beacons at /stats', () => {
    const shared = {
      'data-website-id': 'site-1',
      'data-host-url': '/stats',
      nonce: 'n0nce'
    };
    expect(
      statsScript({ umamiUrl: UMAMI, websiteId: 'site-1', nonce: 'n0nce' })
    ).toEqual({
      tracker: { src: '/stats/script.js', ...shared },
      recorder: { src: '/stats/recorder.js', ...shared }
    });
  });

  it.each([
    ['no Umami', { umamiUrl: undefined, websiteId: 'site-1' }],
    ['no website id', { umamiUrl: UMAMI, websiteId: null }]
  ])('renders nothing with %s', (_label, settings) => {
    expect(statsScript({ ...settings, nonce: undefined })).toBeNull();
  });
});
