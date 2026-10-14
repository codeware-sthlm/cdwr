import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import {
  type SiteStatsLabels,
  SiteStatsSheetBody
} from './site-stats-sheet-body';
import type { SiteStatsData, SiteStatsPeriod } from './types';

const meta = {
  title: 'App CMS/Dashboard/SiteStatsSheetBody'
} satisfies Meta;

export default meta;

const labels: SiteStatsLabels = {
  period: 'Period',
  week: 'Last 7 days',
  month: 'Last 30 days',
  visitors: 'Visitors',
  pageviews: 'Page views',
  visits: 'Visits',
  bounceRate: 'Bounce rate',
  dailyVisitors: 'Visitors per day',
  pages: 'Top pages',
  referrers: 'Referrers',
  devices: 'Devices',
  countries: 'Countries',
  topCaption: 'The lists cover the last 30 days.',
  empty: 'Nothing yet'
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

const empty: SiteStatsData = {
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
  daily: daily.map((day) => ({ ...day, visitors: 0, pageviews: 0 })),
  top: { pages: [], referrers: [], devices: [], countries: [] }
};

const Controlled = ({
  stats,
  locale
}: {
  stats: SiteStatsData;
  locale: string;
}) => {
  const [period, setPeriod] = useState<SiteStatsPeriod>('week');
  return (
    <div className="w-full max-w-xl">
      <SiteStatsSheetBody
        stats={stats}
        period={period}
        onPeriodChange={setPeriod}
        labels={labels}
        locale={locale}
      />
    </div>
  );
};

export const WithData: StoryObj = {
  render: () => <Controlled stats={withData} locale="en" />
};

export const Swedish: StoryObj = {
  render: () => <Controlled stats={withData} locale="sv" />
};

/** A site nobody has visited yet: zeros, no trends, empty lists */
export const Empty: StoryObj = {
  render: () => <Controlled stats={empty} locale="en" />
};

export const PayloadAdminLight = a11yStory(WithData, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(WithData, 'payload-admin', 'dark');
export const FrostLight = a11yStory(WithData, 'frost', 'light');
export const FrostDark = a11yStory(WithData, 'frost', 'dark');
