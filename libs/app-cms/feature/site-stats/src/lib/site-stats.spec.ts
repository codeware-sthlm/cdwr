import { describe, expect, it, vi } from 'vitest';

import {
  type SiteStats,
  createSiteStatsCache,
  fetchSiteStats,
  trendPercent
} from './site-stats';
import type { UmamiClient } from './umami-client';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14);
const HOUR = 60 * 60 * 1000;

const totals = (
  pageviews: number,
  visitors: number,
  visits: number,
  bounces: number
) => ({ pageviews, visitors, visits, bounces, totaltime: 0 });

const fakeClient = (overrides: Partial<UmamiClient> = {}) => {
  const stats = vi.fn<UmamiClient['stats']>(async (_id, { endAt, startAt }) =>
    endAt - startAt < 10 * DAY
      ? { ...totals(20, 10, 12, 6), comparison: totals(10, 8, 10, 5) }
      : { ...totals(100, 40, 50, 10), comparison: totals(200, 0, 0, 0) }
  );
  const pageviews = vi.fn<UmamiClient['pageviews']>(async () => ({
    pageviews: [
      { x: '2026-10-12', y: 5 },
      { x: '2026-10-13', y: 7 }
    ],
    sessions: [{ x: '2026-10-13', y: 3 }]
  }));
  const metrics = vi.fn<UmamiClient['metrics']>(async (_id, { type }) =>
    type === 'referrer'
      ? [
          { x: null, y: 9 },
          { x: '', y: 8 },
          { x: 'google.com', y: 4 }
        ]
      : [
          { x: `${type}-a`, y: 6 },
          { x: null, y: 2 }
        ]
  );
  return { stats, pageviews, metrics, ...overrides };
};

describe('trendPercent', () => {
  it('is null when the previous period had nothing', () => {
    expect(trendPercent(5, 0)).toBeNull();
    expect(trendPercent(0, 0)).toBeNull();
  });

  it('is signed and rounded to whole percent', () => {
    expect(trendPercent(15, 10)).toBe(50);
    expect(trendPercent(5, 10)).toBe(-50);
    expect(trendPercent(0, 10)).toBe(-100);
    expect(trendPercent(2, 3)).toBe(-33);
    expect(trendPercent(5, 3)).toBe(67);
  });
});

describe('fetchSiteStats', () => {
  it('maps the answers into site stats', async () => {
    const stats = await fetchSiteStats(fakeClient(), 'site-1', { now: NOW });

    expect(stats.week).toEqual({
      visitors: 10,
      pageviews: 20,
      visits: 12,
      bounceRate: 0.5,
      trend: { visitors: 25, pageviews: 100, visits: 20, bounceRate: 0 }
    });
    expect(stats.month.visitors).toBe(40);
    expect(stats.month.bounceRate).toBe(0.2);
  });

  it('has no trend when the previous period was empty', async () => {
    const { month } = await fetchSiteStats(fakeClient(), 'site-1', {
      now: NOW
    });

    expect(month.trend).toEqual({
      visitors: null,
      pageviews: -50,
      visits: null,
      bounceRate: null
    });
  });

  it('has no bounce rate without visits', async () => {
    const client = fakeClient({
      stats: async () => ({
        ...totals(0, 0, 0, 0),
        comparison: totals(4, 2, 2, 1)
      })
    });

    const { week } = await fetchSiteStats(client, 'site-1', { now: NOW });

    expect(week.bounceRate).toBeNull();
    expect(week.trend.bounceRate).toBeNull();
    expect(week.trend.visitors).toBe(-100);
  });

  it('has one point per day for the last 30 days, gaps filled with zero', async () => {
    const { daily } = await fetchSiteStats(fakeClient(), 'site-1', {
      now: NOW
    });

    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual({ date: '2026-09-15', visitors: 0, pageviews: 0 });
    expect(daily.slice(-3)).toEqual([
      { date: '2026-10-12', visitors: 0, pageviews: 5 },
      { date: '2026-10-13', visitors: 3, pageviews: 7 },
      { date: '2026-10-14', visitors: 0, pageviews: 0 }
    ]);
  });

  it('reads a bucket with an offset as an instant in the time zone', async () => {
    const client = fakeClient();
    client.pageviews.mockResolvedValue({
      // Midnight in Stockholm on 13 October, as UTC
      pageviews: [{ x: '2026-10-12T22:00:00Z', y: 4 }],
      sessions: [{ x: '2026-10-12 00:00:00', y: 2 }]
    });

    const { daily } = await fetchSiteStats(client, 'site-1', {
      now: NOW,
      timezone: 'Europe/Stockholm'
    });

    expect(daily.find(({ date }) => date === '2026-10-13')).toEqual({
      date: '2026-10-13',
      visitors: 0,
      pageviews: 4
    });
    expect(daily.find(({ date }) => date === '2026-10-12')?.visitors).toBe(2);
  });

  it('drops unknown labels and direct traffic from the top lists', async () => {
    const { top } = await fetchSiteStats(fakeClient(), 'site-1', { now: NOW });

    expect(top.pages).toEqual([{ label: 'path-a', count: 6 }]);
    expect(top.devices).toEqual([{ label: 'device-a', count: 6 }]);
    expect(top.countries).toEqual([{ label: 'country-a', count: 6 }]);
    expect(top.referrers).toEqual([{ label: 'google.com', count: 4 }]);
  });

  it('asks for the right windows', async () => {
    const client = fakeClient();

    await fetchSiteStats(client, 'site-1', {
      now: NOW,
      timezone: 'Europe/Stockholm'
    });

    // Calendar days in Stockholm (UTC+2 in October), today included
    const week = NOW - 6 * DAY - 2 * HOUR;
    const month = NOW - 29 * DAY - 2 * HOUR;
    expect(client.stats).toHaveBeenCalledWith('site-1', {
      startAt: week,
      endAt: NOW
    });
    expect(client.stats).toHaveBeenCalledWith('site-1', {
      startAt: month,
      endAt: NOW
    });
    expect(client.pageviews).toHaveBeenCalledWith('site-1', {
      startAt: month,
      endAt: NOW,
      unit: 'day',
      timezone: 'Europe/Stockholm'
    });
    for (const type of ['path', 'referrer', 'device', 'country']) {
      expect(client.metrics).toHaveBeenCalledWith('site-1', {
        startAt: month,
        endAt: NOW,
        type,
        limit: 5
      });
    }
    expect(client.metrics).toHaveBeenCalledTimes(4);
  });

  it('keeps every calendar day across the spring daylight saving change', async () => {
    const client = fakeClient();
    const now = Date.parse('2026-03-30T00:30:00+02:00');

    const { daily } = await fetchSiteStats(client, 'site-1', {
      now,
      timezone: 'Europe/Stockholm'
    });

    expect(daily).toHaveLength(30);
    expect(daily.slice(-3).map(({ date }) => date)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30'
    ]);
    // The week starts at midnight on 24 March, still winter time (UTC+1)
    expect(client.stats).toHaveBeenCalledWith('site-1', {
      startAt: Date.parse('2026-03-24T00:00:00+01:00'),
      endAt: now
    });
  });

  it('defaults the timezone to UTC', async () => {
    const client = fakeClient();

    await fetchSiteStats(client, 'site-1', { now: NOW });

    expect(client.pageviews).toHaveBeenCalledWith(
      'site-1',
      expect.objectContaining({ timezone: 'UTC' })
    );
  });
});

describe('createSiteStatsCache', () => {
  const empty: SiteStats = {
    week: {
      visitors: 0,
      pageviews: 0,
      visits: 0,
      bounceRate: null,
      trend: { visitors: null, pageviews: null, visits: null, bounceRate: null }
    },
    month: {
      visitors: 0,
      pageviews: 0,
      visits: 0,
      bounceRate: null,
      trend: { visitors: null, pageviews: null, visits: null, bounceRate: null }
    },
    daily: [],
    top: { pages: [], referrers: [], devices: [], countries: [] }
  };

  it('serves a hit within the ttl and reloads after it', async () => {
    let time = 0;
    const cache = createSiteStatsCache({ ttlMs: 1000, now: () => time });
    const load = vi.fn(async () => empty);

    await cache.get('a', load);
    time = 999;
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(1);

    time = 1000;
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('caches per website', async () => {
    const cache = createSiteStatsCache();
    const load = vi.fn(async () => empty);

    await cache.get('a', load);
    await cache.get('b', load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejection', async () => {
    const cache = createSiteStatsCache();
    const load = vi
      .fn<() => Promise<SiteStats>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(empty);

    await expect(cache.get('a', load)).rejects.toThrow('down');
    await expect(cache.get('a', load)).resolves.toBe(empty);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent calls', async () => {
    const cache = createSiteStatsCache();
    let resolve: (value: SiteStats) => void = () => undefined;
    const load = vi.fn(() => new Promise<SiteStats>((r) => (resolve = r)));

    const first = cache.get('a', load);
    const second = cache.get('a', load);
    resolve(empty);

    expect(await first).toBe(empty);
    expect(await second).toBe(empty);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
