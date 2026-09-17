import type { MetadataRoute } from 'next';

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
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_GATE_PASSWORD) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return { rules: { userAgent: '*', allow: '/', disallow: '/admin' } };
}
