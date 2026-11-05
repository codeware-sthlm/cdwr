import { loadSitemapEntries } from '@codeware/app-headless/data-access';
import { sitemapXml } from '@codeware/app-headless/util/seo';
import { createFileRoute } from '@tanstack/react-router';

import { getEnv } from '../env.server';
import { serverContext } from '../server/context';

/** Empty while the site is gated: the gate lets this path through */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const entries = getEnv().SITE_GATE_PASSWORD
          ? []
          : (await loadSitemapEntries(serverContext)).entries;

        return new Response(sitemapXml(entries), {
          headers: { 'content-type': 'application/xml; charset=utf-8' }
        });
      }
    }
  }
});
