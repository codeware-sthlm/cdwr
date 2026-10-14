'use client';

import {
  ToggleGroup,
  ToggleGroupItem
} from '@codeware/shared/ui/shadcn/components/toggle-group';

import { formatTrend } from './site-stats-format';
import { Sparkline } from './sparkline';
import type {
  SiteStatsData,
  SiteStatsPeriod,
  SiteStatsTopEntry
} from './types';

export type SiteStatsLabels = {
  /** Accessible name of the period toggle */
  period: string;
  week: string;
  month: string;
  visitors: string;
  pageviews: string;
  visits: string;
  bounceRate: string;
  /** Names the daily visitors drawing for assistive tech */
  dailyVisitors: string;
  pages: string;
  referrers: string;
  devices: string;
  countries: string;
  /** Says the lists below always cover the last 30 days */
  topCaption: string;
  /** Shown for a list with no entries */
  empty: string;
};

export type SiteStatsSheetBodyProps = {
  stats: SiteStatsData;
  period: SiteStatsPeriod;
  onPeriodChange: (period: SiteStatsPeriod) => void;
  labels: SiteStatsLabels;
  /** Locale for number formatting, e.g. `sv` */
  locale: string;
};

const PERIODS = ['week', 'month'] as const satisfies readonly SiteStatsPeriod[];

const DAYS: Record<SiteStatsPeriod, number> = { week: 7, month: 30 };

function TopList({
  title,
  entries,
  emptyLabel,
  format
}: {
  title: string;
  entries: SiteStatsTopEntry[];
  emptyLabel: string;
  format: (value: number) => string;
}) {
  return (
    <section>
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-muted-foreground mt-1.5 text-xs">{emptyLabel}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {entries.map((entry) => (
            <li
              key={entry.label}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-foreground min-w-0 truncate">
                {entry.label}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {format(entry.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The statistics sheet's content: a period toggle, the period's figures with
 * their trends, the daily visitors line and the top lists.
 *
 * Controlled and hook-free for translation — every label arrives translated.
 */
export function SiteStatsSheetBody({
  stats,
  period,
  onPeriodChange,
  labels,
  locale
}: SiteStatsSheetBodyProps) {
  const figures = stats[period];
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0
  });

  const items = [
    {
      key: 'visitors',
      label: labels.visitors,
      value: number.format(figures.visitors),
      trend: figures.trend.visitors
    },
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
        figures.bounceRate === null ? '—' : percent.format(figures.bounceRate),
      trend: figures.trend.bounceRate
    }
  ];

  const series = stats.daily.slice(-DAYS[period]).map((day) => day.visitors);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
      <ToggleGroup
        type="single"
        value={period}
        onValueChange={(next) => {
          // One option is always active
          const chosen = PERIODS.find((option) => option === next);
          if (chosen) onPeriodChange(chosen);
        }}
        aria-label={labels.period}
        className="bg-muted self-start rounded-lg p-0.5"
      >
        {PERIODS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            className="text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground h-7 rounded-md px-3 text-xs hover:bg-transparent data-[state=on]:shadow-sm"
          >
            {labels[option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <dl className="grid grid-cols-2 gap-4">
        {items.map((item) => {
          const trend = formatTrend(item.trend, locale);
          return (
            <div key={item.key}>
              <dt className="text-muted-foreground text-xs font-medium">
                {item.label}
              </dt>
              <dd className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">
                {item.value}
              </dd>
              {trend && (
                <dd className="text-muted-foreground text-xs tabular-nums">
                  {trend}
                </dd>
              )}
            </div>
          );
        })}
      </dl>

      <div className="text-muted-foreground">
        <Sparkline values={series} label={labels.dailyVisitors} />
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs">{labels.topCaption}</p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <TopList
            title={labels.pages}
            entries={stats.top.pages}
            emptyLabel={labels.empty}
            format={number.format}
          />
          <TopList
            title={labels.referrers}
            entries={stats.top.referrers}
            emptyLabel={labels.empty}
            format={number.format}
          />
          <TopList
            title={labels.devices}
            entries={stats.top.devices}
            emptyLabel={labels.empty}
            format={number.format}
          />
          <TopList
            title={labels.countries}
            entries={stats.top.countries}
            emptyLabel={labels.empty}
            format={number.format}
          />
        </div>
      </div>
    </div>
  );
}
