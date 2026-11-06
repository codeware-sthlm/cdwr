import { resolveSiteOrigin } from '@codeware/app-headless/util/seo';
import {
  findPages,
  findPosts,
  findTours
} from '@codeware/shared/util/payload-api';
import {
  SITEMAP_LIMIT,
  type SitemapEntry,
  sitemapEntries
} from '@codeware/shared/util/payload-utils';

import { payloadRequestOptions } from './payload-request';
import type { ServerContext } from './server-context';

/**
 * The site's origin and the addresses its sitemap lists.
 *
 * The tenant api key reads only published, public content, so what comes back
 * is what a crawler may see. Empty entries when the cms cannot be reached or
 * the origin is unknown: a sitemap that fails must not take the site down.
 */
export async function loadSitemapEntries(
  getContext: () => ServerContext
): Promise<{
  origin: string | null;
  entries: Array<SitemapEntry>;
}> {
  try {
    const ctx = getContext();
    const { env, requestOrigin } = ctx;
    const base = payloadRequestOptions(env);
    const tenantConfig = await ctx.loadTenantConfig();
    if (!tenantConfig) {
      return { origin: null, entries: [] };
    }

    const origin = resolveSiteOrigin(
      tenantConfig.tenant.domains,
      env.FLY_APP_NAME,
      requestOrigin.host,
      requestOrigin.proto
    );
    if (!origin) {
      return { origin: null, entries: [] };
    }

    const options = {
      ...base,
      locale: tenantConfig.locale,
      limit: SITEMAP_LIMIT,
      // Paths and dates are the document's own fields
      depth: 0
    };
    const [pages, posts, tours] = await Promise.all([
      findPages(options),
      findPosts(options),
      findTours(options)
    ]);

    return {
      origin,
      entries: sitemapEntries({
        pages,
        posts,
        tours,
        landingId: tenantConfig.landingPage.id,
        origin
      })
    };
  } catch (error) {
    console.error('Failed to load sitemap entries:', error);
    return { origin: null, entries: [] };
  }
}

/**
 * The site's origin alone, for what needs no document list.
 *
 * `null` when the cms cannot be reached or the origin is unknown.
 */
export async function loadSiteOrigin(
  getContext: () => ServerContext
): Promise<string | null> {
  try {
    const ctx = getContext();
    const tenantConfig = await ctx.loadTenantConfig();

    return tenantConfig
      ? resolveSiteOrigin(
          tenantConfig.tenant.domains,
          ctx.env.FLY_APP_NAME,
          ctx.requestOrigin.host,
          ctx.requestOrigin.proto
        )
      : null;
  } catch (error) {
    console.error('Failed to load the site origin:', error);
    return null;
  }
}
