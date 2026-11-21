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
  z.object({ status: z.literal('waking') }),
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
    dashboardUrl: z.string().url().optional(),
    account: z.enum(['none', 'available', 'ready'])
  })
]) satisfies z.ZodType<SiteStatsAnswer>;

/** Waits before asking again while Umami is waking up; the last answer stands after these */
export const WAKING_RETRY_DELAYS_MS: ReadonlyArray<number> = [10_000, 20_000];

export type SiteStatsState = { status: 'loading' } | SiteStatsAnswer;

export type UseSiteStats = {
  answer: SiteStatsState;
  /** Asks again, keeping the current answer on screen meanwhile */
  reload: () => void;
};

/**
 * The selected workspace's visitor statistics, fetched after mount so a
 * slow statistics service never holds up the dashboard itself, and again
 * whenever another workspace is selected.
 *
 * A `waking` answer is asked again after the delays above. A failed request
 * or an unexpected answer counts as `unreachable`.
 */
export function useSiteStats(): UseSiteStats {
  const { selectedTenantID } = useTenantSelection();
  // Each answer remembers the workspace it was fetched for, so a switch shows
  // loading rather than the previous workspace's numbers
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState<{
    tenant: typeof selectedTenantID;
    answer: SiteStatsAnswer;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (answer: SiteStatsAnswer) =>
      setResult({ tenant: selectedTenantID, answer });

    const load = async (retry = 0): Promise<void> => {
      try {
        const response = await fetch('/api/site-stats', {
          credentials: 'include',
          signal: controller.signal
        });
        const parsed = answerSchema.safeParse(await response.json());
        if (controller.signal.aborted) return;
        const answer: SiteStatsAnswer = parsed.success
          ? parsed.data
          : { status: 'unreachable' };
        const delay = WAKING_RETRY_DELAYS_MS[retry];
        if (answer.status === 'waking' && delay !== undefined) {
          settle(answer);
          timer = setTimeout(() => void load(retry + 1), delay);
        } else {
          // Still waking after the last retry counts as down
          settle(
            answer.status === 'waking' ? { status: 'unreachable' } : answer
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          settle({ status: 'unreachable' });
        }
      }
    };

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedTenantID, reloads]);

  return {
    answer:
      result && result.tenant === selectedTenantID
        ? result.answer
        : { status: 'loading' },
    reload: () => setReloads((count) => count + 1)
  };
}
