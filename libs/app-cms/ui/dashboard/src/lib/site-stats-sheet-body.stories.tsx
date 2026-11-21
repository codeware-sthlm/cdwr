import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { SiteStatsAccountAction } from './site-stats-account-action';
import { SiteStatsPeriodToggle } from './site-stats-period-toggle';
import {
  type SiteStatsLabels,
  SiteStatsSheetBody
} from './site-stats-sheet-body';
import type { SiteStatsData, SiteStatsPeriod } from './types';

const meta = {
  title: 'App CMS/Dashboard/SiteStatsSheetBody'
} satisfies Meta;

export default meta;

type Copy = {
  title: string;
  sub: string;
  openDashboard: string;
  period: string;
  week: string;
  month: string;
  account: React.ComponentProps<typeof SiteStatsAccountAction>['labels'];
  labels: Omit<SiteStatsLabels, 'periodName'>;
};

const en: Copy = {
  title: 'Visitors',
  sub: 'Visitors to your site, counted without cookies.',
  openDashboard: 'Open in Umami',
  period: 'Period',
  week: 'Last 7 days',
  month: 'Last 30 days',
  account: {
    get: 'Get a statistics login',
    getBody:
      'A login to the statistics in Umami is created for you. The username and password are emailed to your address.',
    reset: 'Reset my statistics password',
    resetBody:
      'Your password to the statistics in Umami is replaced by a new one, emailed to your address. The old password stops working.',
    cancel: 'Cancel',
    confirm: 'Email me the login'
  },
  labels: {
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
  }
};

const sv: Copy = {
  title: 'Besökare',
  sub: 'Besökare på er webbplats, räknade utan cookies.',
  openDashboard: 'Öppna i Umami',
  period: 'Period',
  week: 'Senaste 7 dagarna',
  month: 'Senaste 30 dagarna',
  account: {
    get: 'Skaffa en inloggning till statistiken',
    getBody:
      'En inloggning till statistiken i Umami skapas åt dig. Användarnamn och lösenord mejlas till din e-postadress.',
    reset: 'Återställ mitt lösenord till statistiken',
    resetBody:
      'Ditt lösenord till statistiken i Umami ersätts av ett nytt, som mejlas till din e-postadress. Det gamla lösenordet slutar fungera.',
    cancel: 'Avbryt',
    confirm: 'Mejla inloggningen till mig'
  },
  labels: {
    visitors: 'Besökare',
    pageviews: 'Sidvisningar',
    visits: 'Besök',
    bounceRate: 'Avvisningsfrekvens',
    dailyVisitors: 'Besökare per dag',
    perDay: 'per dag',
    pages: 'Mest besökta sidor',
    referrers: 'Hänvisningar',
    devices: 'Enheter',
    countries: 'Länder',
    listsTitle: 'Mest besökt',
    listsPeriod: 'Senaste 30 dagarna',
    empty: 'Inget att lista ännu',
    emptyTitle: 'Inga besökare ännu',
    emptyBody:
      'Siffror visas här när webbplatsen har fått sina första besökare.'
  }
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
  stats,
  locale,
  copy,
  account = 'none'
}: {
  stats: SiteStatsData;
  locale: string;
  copy: Copy;
  account?: 'none' | 'available' | 'ready';
}) => {
  const [period, setPeriod] = useState<SiteStatsPeriod>('week');
  return (
    <div className="bg-background flex w-full max-w-2xl flex-col gap-4 py-4">
      <div className="flex flex-col gap-3 px-4">
        <div>
          <h2 className="text-foreground text-base font-semibold">
            {copy.title}
          </h2>
          <p className="text-muted-foreground text-sm">{copy.sub}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SiteStatsPeriodToggle
            period={period}
            onPeriodChange={setPeriod}
            labels={copy}
          />
          <div className="flex flex-wrap items-center gap-2">
            {account !== 'none' && (
              <SiteStatsAccountAction
                account={account}
                onConfirm={async () => undefined}
                labels={copy.account}
              />
            )}
            <Button variant="outline" size="sm">
              {copy.openDashboard}
            </Button>
          </div>
        </div>
      </div>
      <SiteStatsSheetBody
        stats={stats}
        period={period}
        labels={{ ...copy.labels, periodName: copy[period] }}
        locale={locale}
      />
    </div>
  );
};

export const WithData: StoryObj = {
  render: () => <Frame stats={withData} locale="en" copy={en} />
};

/** A tenant admin without a Umami login yet */
export const AccountAvailable: StoryObj = {
  render: () => (
    <Frame stats={withData} locale="en" copy={en} account="available" />
  )
};

/** A tenant admin who has a login and can ask for a new password */
export const AccountReady: StoryObj = {
  render: () => <Frame stats={withData} locale="sv" copy={sv} account="ready" />
};

export const Swedish: StoryObj = {
  render: () => <Frame stats={withData} locale="sv" copy={sv} />
};

/** A site nobody has visited yet: zeros, no trends, empty lists */
export const Empty: StoryObj = {
  render: () => <Frame stats={empty} locale="en" copy={en} />
};

/** A week old: a handful of visitors, three pages, nothing else to rank */
export const Sparse: StoryObj = {
  render: () => <Frame stats={sparse} locale="en" copy={en} />
};

export const PayloadAdminLight = a11yStory(WithData, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(WithData, 'payload-admin', 'dark');
export const FrostLight = a11yStory(WithData, 'frost', 'light');
export const FrostDark = a11yStory(WithData, 'frost', 'dark');
