import type {
  UmamiClient,
  UmamiMetricType,
  UmamiMetrics,
  UmamiPageviews,
  UmamiPeriodStats
} from './umami-client';

export type PeriodStats = {
  visitors: number;
  pageviews: number;
  visits: number;
  /** bounces / visits, 0..1, null when there were no visits */
  bounceRate: number | null;
  /** Signed whole percentage against the previous period of the same length, null when that period had nothing */
  trend: {
    visitors: number | null;
    pageviews: number | null;
    visits: number | null;
    bounceRate: number | null;
  };
};

export type TopEntry = { label: string; count: number };

export type SiteStats = {
  /** Last 7 days */
  week: PeriodStats;
  /** Last 30 days */
  month: PeriodStats;
  /** One point per day over the last 30 days, oldest first, `YYYY-MM-DD` in the given time zone */
  daily: { date: string; visitors: number; pageviews: number }[];
  /** Over the last 30 days, at most 5 each */
  top: {
    pages: TopEntry[];
    referrers: TopEntry[];
    devices: TopEntry[];
    countries: TopEntry[];
  };
};

/** What the dashboard's statistics endpoint answers; `none` hides the widget */
export type SiteStatsAnswer =
  | { status: 'none' }
  | { status: 'unconfigured' }
  | { status: 'unreachable' }
  | { status: 'ready'; stats: SiteStats };

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 5;

/** Signed whole percentage change, null when there is nothing to compare with */
export const trendPercent = (
  current: number,
  previous: number
): number | null =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

const bounceRateOf = ({ bounces, visits }: UmamiPeriodStats): number | null =>
  visits === 0 ? null : bounces / visits;

const toPeriod = (
  current: UmamiPeriodStats,
  previous: UmamiPeriodStats
): PeriodStats => {
  const bounceRate = bounceRateOf(current);
  const previousRate = bounceRateOf(previous);

  return {
    visitors: current.visitors,
    pageviews: current.pageviews,
    visits: current.visits,
    bounceRate,
    trend: {
      visitors: trendPercent(current.visitors, previous.visitors),
      pageviews: trendPercent(current.pageviews, previous.pageviews),
      visits: trendPercent(current.visits, previous.visits),
      bounceRate:
        bounceRate === null || previousRate === null
          ? null
          : trendPercent(bounceRate, previousRate)
    }
  };
};

/** `YYYY-MM-DD` of an instant, in the given time zone */
const dayIn = (timezone: string) => {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return (instant: number) => format.format(instant);
};

/**
 * The day a bucket of Umami's series belongs to. A bucket with an offset is an
 * instant and is read in the time zone; one without is already a local time.
 */
const bucketDay = (x: string, day: (instant: number) => string) =>
  /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(x) ? day(Date.parse(x)) : x.slice(0, 10);

/**
 * One point for each of the last `days` days, oldest first. Umami leaves out
 * days without traffic, so those are filled in as zero.
 */
const toDaily = (
  series: {
    pageviews: UmamiPageviews['pageviews'];
    sessions: UmamiPageviews['sessions'];
  },
  { now, days, timezone }: { now: number; days: number; timezone: string }
): SiteStats['daily'] => {
  const day = dayIn(timezone);
  const sum = (points: UmamiPageviews['pageviews']) => {
    const byDay = new Map<string, number>();
    for (const { x, y } of points) {
      const key = bucketDay(x, day);
      byDay.set(key, (byDay.get(key) ?? 0) + y);
    }
    return byDay;
  };
  const pageviews = sum(series.pageviews);
  const visitors = sum(series.sessions);

  // Counted back from today, so a daylight saving change cannot skip or repeat a day
  const dates = [
    ...new Set(
      Array.from({ length: days + 1 }, (_, i) => day(now - i * DAY_MS))
    )
  ]
    .slice(0, days)
    .reverse();

  return dates.map((date) => ({
    date,
    visitors: visitors.get(date) ?? 0,
    pageviews: pageviews.get(date) ?? 0
  }));
};

const toTop = (metrics: UmamiMetrics): TopEntry[] =>
  metrics.flatMap(({ x, y }) => (x ? [{ label: x, count: y }] : []));

/** Everything the dashboard shows, from a handful of parallel Umami calls */
export const fetchSiteStats = async (
  umami: UmamiClient,
  websiteId: string,
  {
    now = Date.now(),
    timezone = 'UTC'
  }: { now?: number; timezone?: string } = {}
): Promise<SiteStats> => {
  const range = (days: number) => ({
    startAt: now - days * DAY_MS,
    endAt: now
  });
  const top = (type: UmamiMetricType) =>
    umami.metrics(websiteId, { ...range(30), type, limit: TOP_LIMIT });

  const [week, month, series, pages, referrers, devices, countries] =
    await Promise.all([
      umami.stats(websiteId, range(7)),
      umami.stats(websiteId, range(30)),
      umami.pageviews(websiteId, { ...range(30), unit: 'day', timezone }),
      top('path'),
      top('referrer'),
      top('device'),
      top('country')
    ]);

  return {
    week: toPeriod(week, week.comparison),
    month: toPeriod(month, month.comparison),
    daily: toDaily(series, { now, days: 30, timezone }),
    top: {
      pages: toTop(pages),
      referrers: toTop(referrers),
      devices: toTop(devices),
      countries: toTop(countries)
    }
  };
};

type CacheEntry = { expires: number; value: Promise<SiteStats> };

/** Keeps the latest stats per website for a while, so a dashboard load rarely reaches Umami */
export const createSiteStatsCache = ({
  ttlMs = 5 * 60_000,
  now = Date.now
}: { ttlMs?: number; now?: () => number } = {}) => {
  const entries = new Map<string, CacheEntry>();

  return {
    get: (websiteId: string, load: () => Promise<SiteStats>) => {
      const cached = entries.get(websiteId);
      if (cached && cached.expires > now()) {
        return cached.value;
      }

      const value = load();
      entries.set(websiteId, { expires: now() + ttlMs, value });
      // A failure must not be remembered
      value.catch(() => {
        if (entries.get(websiteId)?.value === value) {
          entries.delete(websiteId);
        }
      });

      return value;
    }
  };
};

export const siteStatsCache = createSiteStatsCache();
