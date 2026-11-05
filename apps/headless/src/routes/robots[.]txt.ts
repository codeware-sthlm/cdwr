import { loadSiteOrigin } from '@codeware/app-headless/data-access';
import { robotsTxt } from '@codeware/app-headless/util/seo';
import { createFileRoute } from '@tanstack/react-router';

import { getEnv } from '../env.server';
import { serverContext } from '../server/context';

/** Answers for the gate too: it lets this path through, and it disallows all */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const gated = !!getEnv().SITE_GATE_PASSWORD;
        const origin = gated ? null : await loadSiteOrigin(serverContext);

        return new Response(robotsTxt({ gated, origin }), {
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
      }
    }
  }
});
