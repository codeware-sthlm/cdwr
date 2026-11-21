import { robotsRules } from '@codeware/shared/util/payload-utils';
import type { MetadataRoute } from 'next';

import { payloadRuntime } from '../security/payload-runtime';
import { isSiteGated } from '../utils/site-gated';

/**
 * Answered per request, not baked at build time.
 *
 * Next prerenders this file by default, and the gate password only exists at
 * runtime — a static robots.txt would promise a gated site is crawlable.
 */
export const dynamic = 'force-dynamic';

/**
 * Keep a gated site out of search results as well as out of sight.
 *
 * Read from `process.env` on every request for the same reason the proxy
 * does: the tenant's secrets are injected at boot, after this module loads.
 * Answers for `/admin` too, which no site wants indexed either way.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const gated = isSiteGated();
  const { allow, disallow, sitemap } = robotsRules({
    gated,
    disallow: ['/admin'],
    origin: gated ? null : await sitemapOrigin()
  });

  return {
    rules: { userAgent: '*', ...(allow && { allow }), disallow },
    ...(sitemap && { sitemap })
  };
}

/**
 * The origin the sitemap lists its addresses under, when it lists any.
 *
 * Only a tenant's site has a sitemap; robots.txt must answer even when the
 * cms cannot be read, so it then names none.
 */
async function sitemapOrigin(): Promise<string | null> {
  try {
    const runtime = await payloadRuntime({ asVisitor: true });
    return runtime.tenantConfig
      ? runtime.payload.config.serverURL || null
      : null;
  } catch (error) {
    console.error('Failed to resolve the sitemap origin:', error);
    return null;
  }
}
