import { getTenantConfig } from '@codeware/shared/util/payload-api';
import { proxyStats } from '@codeware/shared/util/umami';
import { createFileRoute } from '@tanstack/react-router';

import { getEnv } from '../../env.server';
import { payloadRequestOptions } from '../../server/payload-request';

const handle = ({
  request,
  params
}: {
  request: Request;
  params: { _splat?: string };
}) =>
  proxyStats({
    request,
    path: (params._splat ?? '').split('/').filter(Boolean),
    umamiUrl: getEnv().UMAMI_URL,
    // Read only by the paths that check it
    websiteId: async () =>
      (await getTenantConfig(payloadRequestOptions(getEnv())))?.tenant
        ?.statsWebsiteId
  });

/**
 * Relays the site's statistics to Umami from this app, not through the cms:
 * Umami reads the visitor's address from the request, and a hop via the cms
 * would make it the cms's.
 */
export const Route = createFileRoute('/stats/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle
    }
  }
});
