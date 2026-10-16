'use client';

import type { SiteStatsAnswer } from '@codeware/app-cms/feature/site-stats';
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const trendSchema = z.number().nullable();

const periodSchema = z.object({
  visitors: z.number(),
  pageviews: z.number(),
  visits: z.number(),
  bounceRate: z.number().nullable(),
  trend: z.object({
    visitors: trendSchema,
    pageviews: trendSchema,
    visits: trendSchema,
    bounceRate: trendSchema
  })
});

const topSchema = z.array(z.object({ label: z.string(), count: z.number() }));

const answerSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('unconfigured') }),
  z.object({ status: z.literal('unreachable') }),
  z.object({
    status: z.literal('ready'),
    stats: z.object({
      week: periodSchema,
      month: periodSchema,
      daily: z.array(
        z.object({
          date: z.string(),
          visitors: z.number(),
          pageviews: z.number()
        })
      ),
      top: z.object({
        pages: topSchema,
        referrers: topSchema,
        devices: topSchema,
        countries: topSchema
      })
    }),
    dashboardUrl: z.string().url().optional()
  })
]) satisfies z.ZodType<SiteStatsAnswer>;

export type SiteStatsState = { status: 'loading' } | SiteStatsAnswer;

/**
 * The selected workspace's visitor statistics, fetched after mount so a
 * slow statistics service never holds up the dashboard itself, and again
 * whenever another workspace is selected.
 *
 * A failed request or an unexpected answer counts as `unreachable`.
 */
export function useSiteStats(): SiteStatsState {
  const { selectedTenantID } = useTenantSelection();
  // Each answer remembers the workspace it was fetched for, so a switch shows
  // loading rather than the previous workspace's numbers
  const [result, setResult] = useState<{
    tenant: typeof selectedTenantID;
    answer: SiteStatsAnswer;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (answer: SiteStatsAnswer) =>
      setResult({ tenant: selectedTenantID, answer });

    const load = async () => {
      try {
        const response = await fetch('/api/site-stats', {
          credentials: 'include',
          signal: controller.signal
        });
        const parsed = answerSchema.safeParse(await response.json());
        settle(parsed.success ? parsed.data : { status: 'unreachable' });
      } catch {
        if (!controller.signal.aborted) {
          settle({ status: 'unreachable' });
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [selectedTenantID]);

  return result && result.tenant === selectedTenantID
    ? result.answer
    : { status: 'loading' };
}
