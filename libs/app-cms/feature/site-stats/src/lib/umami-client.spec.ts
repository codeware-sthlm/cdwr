import { UmamiError } from '@codeware/shared/util/umami';
import { describe, expect, it, vi } from 'vitest';

import { createUmamiClient } from './umami-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const totals = {
  pageviews: '10',
  visitors: 4,
  visits: '5',
  bounces: 1,
  totaltime: 300
};

const setup = (response: Response | Error, options = {}) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  const client = createUmamiClient({
    baseUrl: 'https://umami.test',
    apiKey: 'secret-key',
    fetchImpl,
    ...options
  });
  return { fetchImpl, client };
};

const requested = (fetchImpl: ReturnType<typeof setup>['fetchImpl']) =>
  new URL(String(fetchImpl.mock.calls[0]?.[0]));

describe('createUmamiClient', () => {
  it('requests stats with auth headers and the window', async () => {
    const { fetchImpl, client } = setup(
      json({ ...totals, comparison: totals })
    );

    await client.stats('site-1', { startAt: 1000, endAt: 2000 });

    const url = requested(fetchImpl);
    expect(url.origin + url.pathname).toBe(
      'https://umami.test/api/websites/site-1/stats'
    );
    expect(url.searchParams.get('startAt')).toBe('1000');
    expect(url.searchParams.get('endAt')).toBe('2000');

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({
      authorization: 'Bearer secret-key',
      accept: 'application/json'
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('coerces numbers that arrive as strings', async () => {
    const { client } = setup(json({ ...totals, comparison: totals }));

    const stats = await client.stats('site-1', { startAt: 1, endAt: 2 });

    expect(stats.pageviews).toBe(10);
    expect(stats.comparison.visits).toBe(5);
  });

  it('requests pageviews per day in a timezone', async () => {
    const { fetchImpl, client } = setup(
      json({
        pageviews: [{ x: '2026-10-01', y: '3' }],
        sessions: [{ x: '2026-10-01', y: 2 }]
      })
    );

    const result = await client.pageviews('site-1', {
      startAt: 1,
      endAt: 2,
      unit: 'day',
      timezone: 'Europe/Stockholm'
    });

    const url = requested(fetchImpl);
    expect(url.pathname).toBe('/api/websites/site-1/pageviews');
    expect(url.searchParams.get('unit')).toBe('day');
    expect(url.searchParams.get('timezone')).toBe('Europe/Stockholm');
    expect(result.pageviews).toEqual([{ x: '2026-10-01', y: 3 }]);
  });

  it('requests metrics and keeps null labels', async () => {
    const { fetchImpl, client } = setup(
      json([
        { x: '/', y: '7' },
        { x: null, y: 1 }
      ])
    );

    const result = await client.metrics('site-1', {
      startAt: 1,
      endAt: 2,
      type: 'referrer',
      limit: 5
    });

    const url = requested(fetchImpl);
    expect(url.pathname).toBe('/api/websites/site-1/metrics');
    expect(url.searchParams.get('type')).toBe('referrer');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(result).toEqual([
      { x: '/', y: 7 },
      { x: null, y: 1 }
    ]);
  });

  it('joins a base url with a trailing slash', async () => {
    const { fetchImpl, client } = setup(
      json({ ...totals, comparison: totals }),
      { baseUrl: 'https://umami.test/' }
    );

    await client.stats('site-1', { startAt: 1, endAt: 2 });

    expect(requested(fetchImpl).pathname).toBe('/api/websites/site-1/stats');
  });

  it('keeps a base path', async () => {
    const { fetchImpl, client } = setup(
      json({ ...totals, comparison: totals }),
      { baseUrl: 'https://host.test/umami/' }
    );

    await client.stats('site-1', { startAt: 1, endAt: 2 });

    expect(requested(fetchImpl).pathname).toBe(
      '/umami/api/websites/site-1/stats'
    );
  });

  it('encodes the website id', async () => {
    const { fetchImpl, client } = setup(
      json({ ...totals, comparison: totals })
    );

    await client.stats('a/b c', { startAt: 1, endAt: 2 });

    expect(requested(fetchImpl).pathname).toBe('/api/websites/a%2Fb%20c/stats');
  });

  it('throws UmamiError with the status, never the key', async () => {
    const { client } = setup(json({ error: 'nope' }, 401));

    const call = client.stats('site-1', { startAt: 1, endAt: 2 });

    await expect(call).rejects.toBeInstanceOf(UmamiError);
    await expect(call).rejects.toMatchObject({ kind: 'refused' });
    await expect(call).rejects.toMatchObject({
      message: expect.stringContaining('401')
    });
    await expect(call).rejects.toMatchObject({
      message: expect.not.stringContaining('secret-key')
    });
  });

  it('throws UmamiError when the answer does not match', async () => {
    const { client } = setup(json({ pageviews: 'many' }));

    await expect(
      client.stats('site-1', { startAt: 1, endAt: 2 })
    ).rejects.toMatchObject({ kind: 'bad-answer' });
  });

  it('throws UmamiError when the answer is not JSON', async () => {
    const { client } = setup(new Response('<html>', { status: 200 }));

    await expect(
      client.metrics('site-1', {
        startAt: 1,
        endAt: 2,
        type: 'path',
        limit: 5
      })
    ).rejects.toBeInstanceOf(UmamiError);
  });
});
