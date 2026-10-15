import {
  STARTER_PAGES,
  STARTER_PURPOSES,
  type StarterLocale,
  type StarterPage,
  type StarterPurpose,
  applySiteDefinition,
  buildStarterDefinition,
  workspaceLocale
} from '@codeware/app-cms/feature/seed';
import { canEdit } from '@codeware/app-cms/util/misc';
import { SITE_THEMES, type SiteTheme } from '@codeware/shared/theme';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest
} from 'payload';

import { firstSiteTenantId } from '../security/first-site-tenant';
import { deploymentPrivacyFacts } from '../utils/deployment-privacy-facts';

/** Quoted in the privacy text; a new workspace has not set its own */
const TOUR_RETENTION_DAYS = 365;

/** Workspaces with an apply in flight, so a double submit cannot apply twice */
const applying = new Set<number>();

export type FirstSiteAnswers = {
  purpose: StarterPurpose;
  pages: Array<StarterPage>;
  theme: SiteTheme;
};

const isOneOf = <T extends string>(
  values: ReadonlyArray<T>,
  value: unknown
): value is T => typeof value === 'string' && values.some((v) => v === value);

/** Closed answers only; anything else is refused rather than ignored */
export function parseFirstSiteAnswers(body: unknown): FirstSiteAnswers | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { purpose, pages, theme } = body as Record<string, unknown>;

  if (
    !isOneOf(STARTER_PURPOSES, purpose) ||
    !isOneOf(SITE_THEMES, theme) ||
    !Array.isArray(pages) ||
    !pages.every((page) => isOneOf(STARTER_PAGES, page)) ||
    new Set(pages).size !== pages.length
  ) {
    return null;
  }

  return { purpose, pages, theme };
}

const refuse = (status: StatusCodes, error = getReasonPhrase(status)) =>
  Response.json({ error }, { status });

/**
 * Apply a starter site, built from the first-site guide's answers.
 *
 * The one place the admin applies a site definition. Kept narrow on purpose:
 * the definition is built here from closed answers, for an admin of their own
 * workspace, and only while that workspace has no pages at all. Everything
 * else goes through `cdwr tenant apply-site`.
 */
export const firstSiteEndpoint: Endpoint = {
  path: '/first-site',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const { payload, user } = req;

    const tenantId = await firstSiteTenantId(payload, req.headers, user);
    if (tenantId === null || !canEdit(user)) {
      return refuse(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const answers = parseFirstSiteAnswers(req.data);
    if (!answers) {
      return refuse(StatusCodes.BAD_REQUEST);
    }

    if (applying.has(tenantId)) {
      return refuse(StatusCodes.CONFLICT, 'The site is already being created');
    }
    applying.add(tenantId);

    try {
      // Drafts count too: any page means the editor has started on their own
      const { totalDocs } = await payload.count({
        collection: 'pages',
        where: { tenant: { equals: tenantId } },
        overrideAccess: true,
        req
      });
      if (totalDocs > 0) {
        return refuse(StatusCodes.CONFLICT, 'The site already has pages');
      }

      const tenant = await payload.findByID({
        collection: 'tenants',
        id: tenantId,
        depth: 0,
        select: {
          name: true,
          slug: true,
          supportedLocales: true,
          statsWebsiteId: true
        },
        overrideAccess: true,
        req
      });

      if (!tenant.slug) {
        return refuse(StatusCodes.INTERNAL_SERVER_ERROR);
      }

      const tenantLocale = workspaceLocale(null, tenant.supportedLocales);
      const locale: StarterLocale = tenantLocale === 'sv' ? 'sv' : 'en';

      const definition = buildStarterDefinition({
        ...answers,
        appName: tenant.name,
        email: user.email,
        locale,
        privacy: {
          tourSignups: false,
          tourRetentionDays: TOUR_RETENTION_DAYS,
          formsRetentionDays: null,
          ...deploymentPrivacyFacts(tenant.statsWebsiteId)
        }
      });

      const report = await applySiteDefinition(payload, definition, {
        tenantSlug: tenant.slug,
        dryRun: false,
        locale
      });

      // Unresolved references roll the apply back without throwing
      if (report.dryRun || report.unresolved.length > 0) {
        payload.logger.error(
          { unresolved: report.unresolved },
          `[first-site] Starter for '${tenant.slug}' was not applied`
        );
        return refuse(StatusCodes.INTERNAL_SERVER_ERROR);
      }

      const { docs } = await payload.find({
        collection: 'pages',
        where: {
          and: [{ tenant: { equals: tenantId } }, { slug: { equals: 'home' } }]
        },
        depth: 0,
        limit: 1,
        select: {},
        overrideAccess: true,
        req
      });

      payload.logger.info(
        `[first-site] Applied '${definition.name}' to '${tenant.slug}'`
      );

      return Response.json(
        {
          created: report.outcomes.filter((o) => o.action === 'created').length,
          homePageId: docs[0]?.id ?? null
        },
        { status: StatusCodes.CREATED }
      );
    } catch (error) {
      payload.logger.error(
        { err: error },
        `[first-site] Applying a starter to tenant ${tenantId} failed`
      );
      return refuse(StatusCodes.INTERNAL_SERVER_ERROR);
    } finally {
      applying.delete(tenantId);
    }
  }
};
