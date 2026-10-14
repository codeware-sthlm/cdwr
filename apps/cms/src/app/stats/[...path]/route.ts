import { getAuthenticatedPayload } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { NextRequest } from 'next/server';

import configPromise from '../../../payload.config';
import { proxyStats } from '../../../utils/stats-proxy';

type Context = { params: Promise<{ path: string[] }> };

const handle = async (request: NextRequest, { params }: Context) =>
  proxyStats({
    request,
    path: (await params).path,
    umamiUrl: getEnv().UMAMI_URL,
    // The tenant the api key serves, without loading its site settings;
    // read only by the paths that check it
    websiteId: async () =>
      (await getAuthenticatedPayload(await configPromise)).tenant
        ?.statsWebsiteId
  });

export const GET = handle;
export const POST = handle;
