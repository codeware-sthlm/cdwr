import { faviconSvg } from '@codeware/shared/util/pure';
import { createFileRoute } from '@tanstack/react-router';

import { IMAGE_CACHE_CONTROL, loadTenantMark } from '../server/tenant-icon';

/** The tenant's own mark as the favicon, following the tab's colour scheme */
export const Route = createFileRoute('/site-icon.svg')({
  server: {
    handlers: {
      GET: async () => {
        const mark = await loadTenantMark();
        const svg = mark ? faviconSvg(mark) : null;

        if (!svg) {
          return new Response(null, { status: 404 });
        }

        return new Response(svg, {
          headers: {
            'content-type': 'image/svg+xml',
            'cache-control': IMAGE_CACHE_CONTROL
          }
        });
      }
    }
  }
});
