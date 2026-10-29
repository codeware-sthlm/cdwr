import { createFileRoute } from '@tanstack/react-router';

import { sitemapXml } from '../crawl-files';
import { getEnv } from '../env.server';
import { loadSitemapEntries } from '../server/sitemap-entries';

/** Empty while the site is gated: the gate lets this path through */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const entries = getEnv().SITE_GATE_PASSWORD
          ? []
          : (await loadSitemapEntries()).entries;

        return new Response(sitemapXml(entries), {
          headers: { 'content-type': 'application/xml; charset=utf-8' }
        });
      }
    }
  }
});
