import { Button } from '@codeware/shared/ui/shadcn/components/button';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { SiteStatsPeriodToggle } from './site-stats-period-toggle';
import {
  type SiteStatsBodyLabels,
  SiteStatsSheetBodyA,
  SiteStatsSheetBodyB
} from './site-stats-sheet-body.variants';
import type { SiteStatsData, SiteStatsPeriod } from './types';

const meta = {
  title: 'App CMS/Dashboard/SiteStatsSheetVariants'
} satisfies Meta;

export default meta;

const labels: Omit<SiteStatsBodyLabels, 'periodName'> = {
  visitors: 'Visitors',
  pageviews: 'Page views',
  visits: 'Visits',
  bounceRate: 'Bounce rate',
  dailyVisitors: 'Visitors per day',
  perDay: 'per day',
  pages: 'Top pages',
  referrers: 'Referrers',
  devices: 'Devices',
  countries: 'Countries',
  listsTitle: 'Most visited',
  listsPeriod: 'Last 30 days',
  empty: 'Nothing to list yet',
  emptyTitle: 'No visitors yet',
  emptyBody: 'Figures appear here once the site has had its first visitors.'
};

const periodLabels = {
  period: 'Period',
  week: 'Last 7 days',
  month: 'Last 30 days'
};

const daily = Array.from({ length: 30 }, (_, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  visitors: 20 + ((index * 7) % 23),
  pageviews: 40 + ((index * 11) % 37)
}));

const withData: SiteStatsData = {
  week: {
    visitors: 1284,
    pageviews: 3910,
    visits: 1630,
    bounceRate: 0.42,
    trend: { visitors: 12, pageviews: 8, visits: 5, bounceRate: -5 }
  },
  month: {
    visitors: 5120,
    pageviews: 15402,
    visits: 6377,
    bounceRate: 0.45,
    trend: { visitors: -3, pageviews: null, visits: 0, bounceRate: null }
  },
  daily,
  top: {
    pages: [
      { label: '/', count: 2310 },
      { label: '/about', count: 804 },
      { label: '/blog/hello-world', count: 512 },
      { label: '/contact', count: 233 },
      { label: '/pricing', count: 120 }
    ],
    referrers: [
      { label: 'google.com', count: 940 },
      { label: 'linkedin.com', count: 211 }
    ],
    devices: [
      { label: 'desktop', count: 3100 },
      { label: 'mobile', count: 1900 },
      { label: 'tablet', count: 120 }
    ],
    countries: [
      { label: 'SE', count: 3800 },
      { label: 'NO', count: 600 },
      { label: 'DE', count: 300 }
    ]
  }
};

const zero = {
  visitors: 0,
  pageviews: 0,
  visits: 0,
  bounceRate: null,
  trend: { visitors: null, pageviews: null, visits: null, bounceRate: null }
};

const empty: SiteStatsData = {
  week: zero,
  month: zero,
  daily: daily.map((day) => ({ ...day, visitors: 0, pageviews: 0 })),
  top: { pages: [], referrers: [], devices: [], countries: [] }
};

/** A week old: a handful of visitors, three pages, nothing else to rank */
const sparse: SiteStatsData = {
  week: {
    visitors: 9,
    pageviews: 21,
    visits: 11,
    bounceRate: 0.55,
    trend: { visitors: null, pageviews: null, visits: null, bounceRate: null }
  },
  month: {
    visitors: 9,
    pageviews: 21,
    visits: 11,
    bounceRate: 0.55,
    trend: { visitors: null, pageviews: null, visits: null, bounceRate: null }
  },
  daily: daily.map((day, index) => ({
    ...day,
    visitors: index > 23 ? ([1, 3, 0, 2, 1, 2][index - 24] ?? 0) : 0,
    pageviews: index > 23 ? 3 : 0
  })),
  top: {
    pages: [
      { label: '/', count: 14 },
      { label: '/about', count: 5 },
      { label: '/contact', count: 2 }
    ],
    referrers: [],
    devices: [],
    countries: []
  }
};

/** The sheet as the admin shows it: header with the toggle and the link, then the body */
const Frame = ({
  variant,
  stats
}: {
  variant: 'A' | 'B';
  stats: SiteStatsData;
}) => {
  const [period, setPeriod] = useState<SiteStatsPeriod>('week');
  const Body = variant === 'A' ? SiteStatsSheetBodyA : SiteStatsSheetBodyB;
  return (
    <div className="bg-background flex w-full max-w-2xl flex-col gap-4 py-4">
      <div className="flex flex-col gap-3 px-4">
        <div>
          <h2 className="text-foreground text-base font-semibold">Visitors</h2>
          <p className="text-muted-foreground text-sm">
            Visitors to your site, counted without cookies.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SiteStatsPeriodToggle
            period={period}
            onPeriodChange={setPeriod}
            labels={periodLabels}
          />
          <Button variant="outline" size="sm">
            Open in Umami
          </Button>
        </div>
      </div>
      <Body
        stats={stats}
        period={period}
        labels={{ ...labels, periodName: periodLabels[period] }}
        locale="en"
      />
    </div>
  );
};

export const VariantA: StoryObj = {
  render: () => <Frame variant="A" stats={withData} />
};
export const VariantB: StoryObj = {
  render: () => <Frame variant="B" stats={withData} />
};
export const VariantAEmpty: StoryObj = {
  render: () => <Frame variant="A" stats={empty} />
};
export const VariantBEmpty: StoryObj = {
  render: () => <Frame variant="B" stats={empty} />
};
export const VariantASparse: StoryObj = {
  render: () => <Frame variant="A" stats={sparse} />
};
export const VariantBSparse: StoryObj = {
  render: () => <Frame variant="B" stats={sparse} />
};
