import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { clientIp, rateLimit } from '@codeware/shared/util/human-check';
import { deploymentNameIssue } from '@codeware/shared/util/pure';
import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';

import config from '../../../../payload.config';
import { isDeploymentTaken, isSignupOpen } from '../../../../utils/signup';

/** Checks per address and window: one per typing pause, so a careful person makes dozens */
export const AVAILABLE_RATE_LIMIT = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Whether a site address is free, for the signup form to say so while the
 * visitor types. The signup itself decides in the end.
 *
 * Only the host serves it, and only while signup is open; otherwise it does
 * not exist. A malformed address is answered without touching the database,
 * and every address is limited.
 */
export async function GET(request: NextRequest) {
  if (getEnv().APP_MODE.type !== 'host') {
    return new NextResponse(null, { status: 404 });
  }

  const deployment = request.nextUrl.searchParams.get('deployment') ?? '';

  const issue = deploymentNameIssue(deployment);
  if (issue !== null) {
    return NextResponse.json(
      { available: false, issue },
      { headers: NO_STORE }
    );
  }

  const limited = rateLimit(
    `${clientIp(request.headers) ?? 'unknown'}:signup-available`,
    { limit: AVAILABLE_RATE_LIMIT }
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'throttled' },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          'Retry-After': String(limited.retryAfterSeconds)
        }
      }
    );
  }

  const payload = await getPayload({ config });
  if (!(await isSignupOpen(payload))) {
    return new NextResponse(null, { status: 404 });
  }
  const taken = await isDeploymentTaken(payload, deployment);

  return NextResponse.json({ available: !taken }, { headers: NO_STORE });
}
