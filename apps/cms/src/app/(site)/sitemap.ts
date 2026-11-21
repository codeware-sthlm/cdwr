import { getPages, getPosts, getTours } from '@codeware/app-cms/data-access';
import {
  SITEMAP_LIMIT,
  publicVisibilityWhere,
  sitemapEntries
} from '@codeware/shared/util/payload-utils';
import type { MetadataRoute } from 'next';

import { payloadRuntime } from '../../security/payload-runtime';
import { isSiteGated } from '../../utils/site-gated';

/** Answered per request: the gate and the content only exist at runtime */
export const dynamic = 'force-dynamic';

/**
 * The tenant's published, public pages, posts and tours.
 *
 * Read as a visitor, so a signed-in editor gets the same list a crawler would;
 * the visibility rule is applied on top because access control lets an editor
 * read members-only content. Empty while the site is gated or has no tenant,
 * the same cases robots.txt keeps crawlers out of.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isSiteGated()) {
    return [];
  }

  const runtime = await payloadRuntime({ asVisitor: true });
  if (!runtime.tenantConfig) {
    return [];
  }

  // The address the site calls its own, the workspace's primary domain once
  // adopted, so the list names one host whichever one the crawler came in on
  const origin = runtime.payload.config.serverURL;
  if (!origin) {
    return [];
  }

  const query = { depth: 0, limit: SITEMAP_LIMIT };
  // Tours have no visibility field, and Payload refuses a query on one
  const visible = { ...query, where: publicVisibilityWhere };
  const [pages, posts, tours] = await Promise.all([
    getPages(runtime, visible),
    getPosts(runtime, visible),
    getTours(runtime, query)
  ]);

  return sitemapEntries({
    pages: pages?.docs ?? [],
    posts: posts?.docs ?? [],
    tours: tours?.docs ?? [],
    landingId: runtime.tenantConfig.landingPage.id,
    origin
  }).map(({ url, lastModified }) => ({
    url,
    ...(lastModified && { lastModified })
  }));
}
