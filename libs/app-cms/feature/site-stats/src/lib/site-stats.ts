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
  | {
      status: 'ready';
      stats: SiteStats;
      /** The tenant's public Umami dashboard, when it has a share link */
      dashboardUrl?: string;
    };

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

/** The calendar date `offset` days from `date`; plain date arithmetic, so no daylight saving change can skip a day */
const shiftDate = (date: string, offset: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** How far the time zone's wall clock is ahead of UTC at an instant, in ms */
const offsetAt = (instant: number, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)])
  );
  const wallClock = Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
};

/** The instant a calendar date starts in the time zone */
const startOfDay = (date: string, timezone: string) => {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  // Corrected once more with the offset at the result, for a day that starts on a change
  const guess = utcMidnight - offsetAt(utcMidnight, timezone);
  return utcMidnight - offsetAt(guess, timezone);
};

/**
 * The day a bucket of Umami's series belongs to. A bucket with an offset is an
 * instant and is read in the time zone; one without is already a local time.
 */
const bucketDay = (x: string, day: (instant: number) => string) =>
  /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(x) ? day(Date.parse(x)) : x.slice(0, 10);

/**
 * One point for each date, oldest first. Umami leaves out days without
 * traffic, so those are filled in as zero.
 */
const toDaily = (
  series: {
    pageviews: UmamiPageviews['pageviews'];
    sessions: UmamiPageviews['sessions'];
  },
  { dates, timezone }: { dates: ReadonlyArray<string>; timezone: string }
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
  // Whole calendar days in the time zone, today included, so the totals
  // cover exactly the days the chart shows
  const today = dayIn(timezone)(now);
  const dates = Array.from({ length: 30 }, (_, i) => shiftDate(today, i - 29));
  const range = (days: number) => ({
    startAt: startOfDay(shiftDate(today, 1 - days), timezone),
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
    daily: toDaily(series, { dates, timezone }),
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
