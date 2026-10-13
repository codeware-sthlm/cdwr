import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { NextRequest } from 'next/server';

import { proxyStats } from '../../../utils/stats-proxy';

type Context = { params: Promise<{ path: string[] }> };

const handle = async (request: NextRequest, { params }: Context) =>
  proxyStats({
    request,
    path: (await params).path,
    umamiUrl: getEnv().UMAMI_URL
  });

export const GET = handle;
export const POST = handle;
