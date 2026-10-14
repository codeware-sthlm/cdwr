'use client';

import {
  type SiteStatsPeriod,
  SiteStatsSheetBody,
  StatusWidget,
  formatTrend
} from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { hasRole } from '@codeware/app-cms/util/misc';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import type { User } from '@codeware/shared/util/payload-types';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { useAuth, useTranslation } from '@payloadcms/ui';
import { useState } from 'react';

import { useSiteStats } from './use-site-stats';

/**
 * Visitor statistics for the selected workspace, as a dashboard widget with
 * the full figures in a sheet.
 *
 * Renders nothing for a workspace without statistics, so the widget only
 * appears where there is something to say about it.
 */
export function SiteStatsWidget() {
  const answer = useSiteStats();
  const { user } = useAuth<User>();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<SiteStatsPeriod>('week');

  const locale = i18n.language;
  const title = t('statistics:title');

  if (answer.status === 'none') {
    return null;
  }

  const placeholder = (detail: string) => (
    <StatusWidget
      icon={ChartBarIcon}
      tone="neutral"
      title={title}
      metric="—"
      detail={detail}
    />
  );

  const widget = (() => {
    switch (answer.status) {
      case 'loading':
        return placeholder(t('statistics:loading'));
      case 'unconfigured':
        return placeholder(
          hasRole(user ?? null, 'system-user')
            ? t('statistics:unconfiguredSystem')
            : t('statistics:unavailable')
        );
      case 'unreachable':
        return placeholder(t('statistics:unreachable'));
      case 'ready': {
        const { week } = answer.stats;
        const trend = formatTrend(week.trend.visitors, locale);
        return (
          <StatusWidget
            icon={ChartBarIcon}
            tone="neutral"
            title={title}
            metric={
              week.visitors === 1
                ? t('statistics:metricUnitOne')
                : t('statistics:metricUnit', {
                    count: new Intl.NumberFormat(locale).format(week.visitors)
                  })
            }
            detail={
              trend
                ? t('statistics:detailTrend', { trend })
                : t('statistics:detailNoTrend')
            }
            openLabel={t('statistics:openLabel')}
            onOpen={() => setOpen(true)}
          />
        );
      }
    }
  })();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {widget}

      {answer.status === 'ready' && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent size="lg" className="codeware-admin twp gap-0">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{t('statistics:sheetSub')}</SheetDescription>
            </SheetHeader>
            <SiteStatsSheetBody
              stats={answer.stats}
              period={period}
              onPeriodChange={setPeriod}
              locale={locale}
              labels={{
                period: t('statistics:period'),
                week: t('statistics:week'),
                month: t('statistics:month'),
                visitors: t('statistics:visitors'),
                pageviews: t('statistics:pageviews'),
                visits: t('statistics:visits'),
                bounceRate: t('statistics:bounceRate'),
                dailyVisitors: t('statistics:dailyVisitors'),
                pages: t('statistics:pages'),
                referrers: t('statistics:referrers'),
                devices: t('statistics:devices'),
                countries: t('statistics:countries'),
                topCaption: t('statistics:topCaption'),
                empty: t('statistics:empty')
              }}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
