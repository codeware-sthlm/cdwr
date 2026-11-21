'use client';

import { cn } from '@codeware/shared/util/ui';
import { ChartBarIcon } from '@heroicons/react/24/outline';

import { EmptyState } from './empty-state';
import { formatTrend } from './site-stats-format';
import { Sparkline } from './sparkline';
import type {
  SiteStatsData,
  SiteStatsPeriod,
  SiteStatsTopEntry
} from './types';

/** Labels the body needs; the period toggle has its own */
export type SiteStatsLabels = {
  visitors: string;
  pageviews: string;
  visits: string;
  bounceRate: string;
  /** Names the daily visitors drawing */
  dailyVisitors: string;
  /** "per day", under the visitors figure */
  perDay: string;
  pages: string;
  referrers: string;
  devices: string;
  countries: string;
  /** Heads the lists, e.g. "Most visited" */
  listsTitle: string;
  /** The window the lists always cover, e.g. "Last 30 days" */
  listsPeriod: string;
  /** Shown when no list has anything yet, but the site has had visitors */
  empty: string;
  /** The empty state's title and body, for a site nobody has visited */
  emptyTitle: string;
  emptyBody: string;
  /** The current period's name, read with the figures and the chart */
  periodName: string;
};

export type SiteStatsSheetBodyProps = {
  stats: SiteStatsData;
  period: SiteStatsPeriod;
  labels: SiteStatsLabels;
  /** Locale for number formatting, e.g. `sv` */
  locale: string;
};

const DAYS: Record<SiteStatsPeriod, number> = { week: 7, month: 30 };

/** A trend as an arrow and a size, in the text colour; the sign is spoken */
function Trend({
  value,
  locale,
  className
}: {
  value: number | null;
  locale: string;
  className?: string;
}) {
  const text = formatTrend(value, locale);
  if (value === null || text === null) return null;
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return (
    <span
      className={cn(
        'text-muted-foreground text-xs font-medium tabular-nums',
        className
      )}
    >
      <span aria-hidden>
        {arrow} {text.replace(/^[+−-]/, '')}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

const figuresOf = (
  stats: SiteStatsData,
  period: SiteStatsPeriod,
  labels: SiteStatsLabels,
  locale: string
) => {
  const figures = stats[period];
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0
  });
  return {
    number,
    visitors: {
      label: labels.visitors,
      value: number.format(figures.visitors),
      trend: figures.trend.visitors
    },
    others: [
      {
        key: 'pageviews',
        label: labels.pageviews,
        value: number.format(figures.pageviews),
        trend: figures.trend.pageviews
      },
      {
        key: 'visits',
        label: labels.visits,
        value: number.format(figures.visits),
        trend: figures.trend.visits
      },
      {
        key: 'bounceRate',
        label: labels.bounceRate,
        value:
          figures.bounceRate === null
            ? '—'
            : percent.format(figures.bounceRate),
        trend: figures.trend.bounceRate
      }
    ],
    series: stats.daily.slice(-DAYS[period]).map((day) => day.visitors)
  };
};

const isUntouched = (stats: SiteStatsData) =>
  stats.month.visitors === 0 &&
  stats.month.pageviews === 0 &&
  Object.values(stats.top).every((list) => list.length === 0);

function Untouched({ labels }: { labels: SiteStatsLabels }) {
  return (
    <div className="px-4 pb-4">
      <div className="bg-card rounded-xl border">
        <EmptyState
          icon={ChartBarIcon}
          title={labels.emptyTitle}
          description={labels.emptyBody}
        />
      </div>
    </div>
  );
}

/** A ranked list; `bars` draws each count as a share of the largest */
function TopList({
  title,
  entries,
  format,
  bars = false
}: {
  title: string;
  entries: SiteStatsTopEntry[];
  format: (value: number) => string;
  bars?: boolean;
}) {
  const max = Math.max(...entries.map((entry) => entry.count), 1);
  return (
    <section className="min-w-0">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li
            key={entry.label}
            className={cn(
              'relative isolate flex items-baseline justify-between gap-3 text-sm',
              bars && '-mx-1.5 px-1.5'
            )}
          >
            {bars && (
              <span
                aria-hidden
                className="bg-muted absolute inset-y-0 left-0 -z-10 rounded-sm"
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            )}
            <span className="text-foreground min-w-0 truncate">
              {entry.label}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {format(entry.count)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The lists that have entries, with pages and referrers first */
const listsOf = (stats: SiteStatsData, labels: SiteStatsLabels) =>
  (
    [
      { key: 'pages', title: labels.pages, entries: stats.top.pages },
      {
        key: 'referrers',
        title: labels.referrers,
        entries: stats.top.referrers
      },
      { key: 'devices', title: labels.devices, entries: stats.top.devices },
      {
        key: 'countries',
        title: labels.countries,
        entries: stats.top.countries
      }
    ] as const
  ).filter((list) => list.entries.length > 0);

function ListsHeading({ title, period }: { title: string; period: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      <span className="text-muted-foreground text-xs">{period}</span>
    </div>
  );
}

/**
 * The sheet body: stat tiles. The visitors tile is the hero and carries the
 * daily line; pages and referrers run full width above devices and
 * countries, with a bar per row for the share.
 */
export function SiteStatsSheetBody({
  stats,
  period,
  labels,
  locale
}: SiteStatsSheetBodyProps) {
  if (isUntouched(stats)) return <Untouched labels={labels} />;
  const { number, visitors, others, series } = figuresOf(
    stats,
    period,
    labels,
    locale
  );
  const lists = listsOf(stats, labels);
  const primary = lists.filter(
    (list) => list.key === 'pages' || list.key === 'referrers'
  );
  const secondary = lists.filter(
    (list) => list.key === 'devices' || list.key === 'countries'
  );

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
      <dl className="grid grid-cols-3 gap-3">
        <div className="bg-card col-span-3 rounded-xl border p-4">
          <dt className="text-muted-foreground text-xs font-medium">
            {visitors.label} <span>· {labels.periodName}</span>
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="text-foreground text-3xl font-semibold tabular-nums">
              {visitors.value}
            </span>
            <Trend value={visitors.trend} locale={locale} />
          </dd>
          <dd className="text-muted-foreground mt-3">
            <Sparkline
              values={series}
              label={labels.dailyVisitors}
              area
              className="h-14"
            />
            <span className="mt-1 block text-xs">{labels.perDay}</span>
          </dd>
        </div>
        {others.map((item) => (
          <div key={item.key} className="bg-card min-w-0 rounded-xl border p-3">
            <dt className="text-muted-foreground text-xs leading-tight font-medium">
              {item.label}
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-foreground text-xl font-semibold tabular-nums">
                {item.value}
              </span>
              <Trend value={item.trend} locale={locale} />
            </dd>
          </div>
        ))}
      </dl>

      {lists.length === 0 ? (
        <p className="text-muted-foreground text-xs">{labels.empty}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ListsHeading title={labels.listsTitle} period={labels.listsPeriod} />
          {primary.map((list) => (
            <TopList
              key={list.key}
              title={list.title}
              entries={list.entries}
              format={number.format}
              bars
            />
          ))}
          {secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-5 border-t pt-5 sm:grid-cols-2">
              {secondary.map((list) => (
                <TopList
                  key={list.key}
                  title={list.title}
                  entries={list.entries}
                  format={number.format}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
