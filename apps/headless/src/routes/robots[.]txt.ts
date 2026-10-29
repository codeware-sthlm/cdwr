import { createFileRoute } from '@tanstack/react-router';

import { robotsTxt } from '../crawl-files';
import { getEnv } from '../env.server';
import { loadSitemapEntries } from '../server/sitemap-entries';

/** Answers for the gate too: it lets this path through, and it disallows all */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const gated = !!getEnv().SITE_GATE_PASSWORD;
        const origin = gated ? null : (await loadSitemapEntries()).origin;

        return new Response(robotsTxt({ gated, origin }), {
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
      }
    }
  }
});
