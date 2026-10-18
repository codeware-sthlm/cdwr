'use client';

import {
  SiteStatsAccountAction,
  type SiteStatsPeriod,
  SiteStatsPeriodToggle,
  SiteStatsSheetBody,
  StatusWidget,
  formatTrend
} from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { hasRole } from '@codeware/app-cms/util/misc';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import type { User } from '@codeware/shared/util/payload-types';
import {
  ArrowTopRightOnSquareIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { toast, useAuth, useTranslation } from '@payloadcms/ui';
import { useRef, useState } from 'react';

import { useSiteStats } from './use-site-stats';

/**
 * Visitor statistics for the selected workspace, as a dashboard widget with
 * the full figures in a sheet.
 *
 * Renders nothing for a workspace without statistics, so the widget only
 * appears where there is something to say about it.
 */
export function SiteStatsWidget() {
  const { answer, reload } = useSiteStats();
  const { user } = useAuth<User>();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<SiteStatsPeriod>('week');
  // The tile's button opens the sheet from outside it, so Radix has no
  // trigger to give focus back to; the sheet returns it here instead
  const tile = useRef<HTMLDivElement>(null);

  const sendLogin = async (action: 'create' | 'reset') => {
    try {
      const response = await fetch('/api/site-stats/account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
    } catch (error) {
      toast.error(t('statistics:loginFailed'));
      throw error;
    }
    toast.success(t('statistics:loginSent'));
    reload();
  };

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
      case 'waking':
        return placeholder(t('statistics:waking'));
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
      <div ref={tile} className="contents">
        {widget}
      </div>

      {answer.status === 'ready' && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            size="lg"
            className="codeware-admin twp gap-0"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              tile.current?.querySelector('button')?.focus();
            }}
          >
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{t('statistics:sheetSub')}</SheetDescription>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SiteStatsPeriodToggle
                  period={period}
                  onPeriodChange={setPeriod}
                  labels={{
                    period: t('statistics:period'),
                    week: t('statistics:week'),
                    month: t('statistics:month')
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {answer.account !== 'none' && (
                    <SiteStatsAccountAction
                      account={answer.account}
                      onConfirm={() =>
                        sendLogin(
                          answer.account === 'ready' ? 'reset' : 'create'
                        )
                      }
                      labels={{
                        get: t('statistics:getLogin'),
                        getBody: t('statistics:getLoginBody'),
                        reset: t('statistics:resetLogin'),
                        resetBody: t('statistics:resetLoginBody'),
                        cancel: t('statistics:loginCancel'),
                        confirm: t('statistics:loginConfirm')
                      }}
                    />
                  )}
                  {answer.dashboardUrl && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-fit"
                    >
                      <a
                        href={answer.dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('statistics:openDashboard')}
                        <ArrowTopRightOnSquareIcon aria-hidden />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </SheetHeader>
            <SiteStatsSheetBody
              stats={answer.stats}
              period={period}
              locale={locale}
              labels={{
                visitors: t('statistics:visitors'),
                pageviews: t('statistics:pageviews'),
                visits: t('statistics:visits'),
                bounceRate: t('statistics:bounceRate'),
                dailyVisitors: t('statistics:dailyVisitors'),
                perDay: t('statistics:perDay'),
                pages: t('statistics:pages'),
                referrers: t('statistics:referrers'),
                devices: t('statistics:devices'),
                countries: t('statistics:countries'),
                listsTitle: t('statistics:listsTitle'),
                listsPeriod: t('statistics:month'),
                empty: t('statistics:empty'),
                emptyTitle: t('statistics:emptyTitle'),
                emptyBody: t('statistics:emptyBody'),
                periodName: t(
                  period === 'week' ? 'statistics:week' : 'statistics:month'
                )
              }}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
