import { getPages, getPosts, getTours } from '@codeware/app-cms/data-access';
import { publicVisibilityWhere } from '@codeware/app-cms/util/access';
import { sitePath } from '@codeware/app-cms/util/misc';
import type { MetadataRoute } from 'next';

import { payloadRuntime } from '../../security/payload-runtime';
import { isSiteGated } from '../../utils/site-gated';

/** Answered per request: the gate and the content only exist at runtime */
export const dynamic = 'force-dynamic';

/** Most documents of a kind a sitemap lists; the protocol allows 50 000 URLs */
const LIMIT = 5000;

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

  const query = { depth: 0, limit: LIMIT };
  // Tours have no visibility field, and Payload refuses a query on one
  const visible = { ...query, where: publicVisibilityWhere };
  const [pages, posts, tours] = await Promise.all([
    getPages(runtime, visible),
    getPosts(runtime, visible),
    getTours(runtime, query)
  ]);

  const landingId = runtime.tenantConfig.landingPage.id;
  const entries = [
    ...(pages?.docs ?? []).map((doc) => ({
      path: sitePath('pages', doc, landingId),
      doc
    })),
    ...(posts?.docs ?? []).map((doc) => ({
      path: sitePath('posts', doc),
      doc
    })),
    ...(tours?.docs ?? []).map((doc) => ({
      path: sitePath('tours', doc),
      doc
    }))
  ];

  const seen = new Set<string>();
  return entries.flatMap(({ path, doc }) => {
    if (seen.has(path)) {
      return [];
    }
    seen.add(path);
    return [
      {
        url: new URL(path, origin).toString(),
        lastModified: doc.updatedAt
      }
    ];
  });
}
