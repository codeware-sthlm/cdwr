import {
  findPages,
  findPosts,
  findTours,
  getTenantConfig
} from '@codeware/shared/util/payload-api';
import { sitePath } from '@codeware/shared/util/payload-utils';

import type { SitemapEntry } from '../crawl-files';
import { getEnv } from '../env.server';

import { payloadRequestOptions } from './payload-request';
import { resolveSiteOrigin } from './site-origin';

/** Most documents of a kind a sitemap lists; the protocol allows 50 000 URLs */
const LIMIT = 5000;

/**
 * The site's origin and the addresses its sitemap lists.
 *
 * The tenant api key reads only published, public content, so what comes back
 * is what a crawler may see. Empty entries when the cms cannot be reached or
 * the origin is unknown: a sitemap that fails must not take the site down.
 */
export async function loadSitemapEntries(): Promise<{
  origin: string | null;
  entries: Array<SitemapEntry>;
}> {
  try {
    const env = getEnv();
    const base = payloadRequestOptions(env);
    const tenantConfig = await getTenantConfig(base);
    if (!tenantConfig) {
      return { origin: null, entries: [] };
    }

    const origin = resolveSiteOrigin(
      tenantConfig.tenant.domains,
      env.FLY_APP_NAME
    );
    if (!origin) {
      return { origin: null, entries: [] };
    }

    const options = { ...base, locale: tenantConfig.locale, limit: LIMIT };
    const [pages, posts, tours] = await Promise.all([
      findPages(options),
      findPosts(options),
      findTours(options)
    ]);

    const landingId = tenantConfig.landingPage.id;
    const at = (path: string, lastModified: string | null | undefined) => ({
      url: new URL(path, origin).toString(),
      lastModified
    });

    return {
      origin,
      entries: [
        ...pages.map((doc) =>
          at(sitePath('pages', doc, landingId), doc.updatedAt)
        ),
        // The landing page answers at `/` even if the list missed it; the
        // sitemap drops the repeat when it did not
        at('/', undefined),
        ...posts.map((doc) => at(sitePath('posts', doc), doc.updatedAt)),
        ...tours.map((doc) => at(sitePath('tours', doc), doc.updatedAt))
      ]
    };
  } catch (error) {
    console.error('Failed to load sitemap entries:', error);
    return { origin: null, entries: [] };
  }
}
