import {
  UmamiError,
  parseUmamiJson,
  umamiFetch,
  umamiRefused
} from '@codeware/shared/util/umami';
import { z } from 'zod';

const count = z.coerce.number();

const StatsSchema = z.object({
  pageviews: count,
  visitors: count,
  visits: count,
  bounces: count,
  totaltime: count
});

const StatsResponseSchema = StatsSchema.extend({
  comparison: StatsSchema
});

const SeriesSchema = z.array(z.object({ x: z.string(), y: count }));

const PageviewsResponseSchema = z.object({
  pageviews: SeriesSchema,
  sessions: SeriesSchema
});

const MetricsResponseSchema = z.array(
  z.object({ x: z.string().nullable(), y: count })
);

/** Totals for one period */
export type UmamiPeriodStats = z.infer<typeof StatsSchema>;

/** Totals for a period, with the previous period of the same length */
export type UmamiStats = z.infer<typeof StatsResponseSchema>;

/** Counts per time unit, `x` is the start of the unit */
export type UmamiPageviews = z.infer<typeof PageviewsResponseSchema>;

/** Ranked values of one kind, `x` is null when Umami could not tell */
export type UmamiMetrics = z.infer<typeof MetricsResponseSchema>;

/** What a metrics query ranks */
export type UmamiMetricType = 'path' | 'referrer' | 'device' | 'country';

/** A time window in epoch milliseconds */
export type UmamiRange = { startAt: number; endAt: number };

export type UmamiClient = {
  stats: (websiteId: string, range: UmamiRange) => Promise<UmamiStats>;
  pageviews: (
    websiteId: string,
    query: UmamiRange & { unit: 'day'; timezone: string }
  ) => Promise<UmamiPageviews>;
  metrics: (
    websiteId: string,
    query: UmamiRange & { type: UmamiMetricType; limit: number }
  ) => Promise<UmamiMetrics>;
};

type UmamiClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** A read-only Umami client; every call is parsed, so a bad answer throws */
export const createUmamiClient = ({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 5000
}: UmamiClientOptions): UmamiClient => {
  const get = async <T extends z.ZodType>(
    websiteId: string,
    path: string,
    query: Record<string, string | number>,
    schema: T
  ): Promise<z.output<T>> => {
    const params = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)])
    );
    const answer = await umamiFetch({
      url: baseUrl,
      path: `websites/${encodeURIComponent(websiteId)}/${path}?${params}`,
      label: path,
      auth: { apiKey },
      timeoutMs,
      fetchImpl
    });
    if (!answer.ok) throw umamiRefused(path, answer);

    const body = parseUmamiJson(path, answer.text);

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UmamiError(`Umami ${path}: unexpected answer`, 'bad-answer');
    }

    return parsed.data;
  };

  return {
    stats: (websiteId, { startAt, endAt }) =>
      get(websiteId, 'stats', { startAt, endAt }, StatsResponseSchema),
    pageviews: (websiteId, { startAt, endAt, unit, timezone }) =>
      get(
        websiteId,
        'pageviews',
        { startAt, endAt, unit, timezone },
        PageviewsResponseSchema
      ),
    metrics: (websiteId, { startAt, endAt, type, limit }) =>
      get(
        websiteId,
        'metrics',
        { startAt, endAt, type, limit },
        MetricsResponseSchema
      )
  };
};
