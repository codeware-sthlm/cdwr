import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type SiteStatsAnswer,
  fetchSiteStats,
  getUmamiApi,
  isWaking,
  shareDashboardUrl,
  siteStatsCache
} from '@codeware/app-cms/feature/site-stats';
import { getUserTenantIDs, hasRole } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

import { resolveStatsAccount } from './site-stats-account';

/** Days are counted in the platform's own time zone */
const TIMEZONE = 'Europe/Stockholm';

const answer = (body: SiteStatsAnswer) =>
  Response.json(body, {
    status: StatusCodes.OK,
    headers: { 'cache-control': 'private, no-store' }
  });

/**
 * The selected workspace's visitor statistics, for the dashboard widget.
 *
 * Called after the dashboard has rendered, so a slow or missing Umami never
 * holds up the first page an admin sees.
 *
 * Everyone who may open the workspace sees its statistics, read-only members
 * included. Tenants access would hide the website id from them, so it is read
 * with an override, limited to that one field of that one tenant. The tenant
 * comes from the selection cookie, which anyone can set, so it is only
 * accepted for a system user or a member of that tenant.
 */
export const siteStatsEndpoint: Endpoint = {
  path: '/site-stats',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = req.user ?? null;
    if (!user) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.UNAUTHORIZED) },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const tenantId = getSingleTenantIdFromHeaders(req.headers, user);
    const mayRead =
      tenantId !== null &&
      (hasRole(user, 'system-user') ||
        getUserTenantIDs(user).includes(tenantId));
    if (!mayRead) {
      return answer({ status: 'none' });
    }

    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
      select: {
        statsWebsiteId: true,
        statsShareId: true,
        statsTeamId: true
      },
      overrideAccess: true,
      disableErrors: true,
      req
    });
    const websiteId = tenant?.statsWebsiteId;
    if (!websiteId) {
      return answer({ status: 'none' });
    }

    const { UMAMI_URL: umamiUrl } = getEnv();
    if (!umamiUrl) {
      return answer({ status: 'unconfigured' });
    }
    const umamiApi = await getUmamiApi(umamiUrl);
    if (umamiApi.status === 'unconfigured') {
      return answer({ status: 'unconfigured' });
    }
    if (umamiApi.status === 'unreachable') {
      req.payload.logger.error(
        `[siteStats] Umami credentials unreadable: ${umamiApi.error}`
      );
      return answer({ status: 'unreachable' });
    }

    try {
      const stats = await siteStatsCache.get(websiteId, () =>
        fetchSiteStats(umamiApi.umami, websiteId, { timezone: TIMEZONE })
      );
      const { state: account } = await resolveStatsAccount(
        req,
        tenantId,
        tenant
      );
      const dashboardUrl = shareDashboardUrl(umamiUrl, tenant.statsShareId);
      return answer({
        status: 'ready',
        stats,
        account,
        ...(dashboardUrl ? { dashboardUrl } : {})
      });
    } catch (error) {
      if (isWaking(error)) {
        // Expected after idle; a warning so a long outage still shows in the log
        req.payload.logger.warn(
          `[siteStats] Umami is waking up for tenant ${tenantId}: ${String(error)}`
        );
        return answer({ status: 'waking' });
      }
      req.payload.logger.error(
        `[siteStats] Umami did not answer for tenant ${tenantId}: ${String(error)}`
      );
      return answer({ status: 'unreachable' });
    }
  }
};
