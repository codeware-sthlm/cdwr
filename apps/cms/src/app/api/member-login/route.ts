import { loginMember } from '@codeware/app-cms/data-access';
import {
  clientIp,
  isRateLimited,
  rateLimit
} from '@codeware/shared/util/human-check';
import { resolveReturnPath } from '@codeware/shared/util/site-gate';
import { type NextRequest, NextResponse } from 'next/server';
import { generatePayloadCookie } from 'payload/shared';

import configPromise from '../../../payload.config';
import { payloadRuntime } from '../../../security/payload-runtime';
import {
  MEMBER_LOGIN_PATH,
  type MemberLoginError,
  usersAuthConfig
} from '../../../utils/member-login';

/**
 * Payload locks an account after five failures, but that is per account. A
 * per-address limit is what stops a spray across many addresses.
 */
const ATTEMPTS_PER_ADDRESS = 10;

/**
 * Redirect to a path on this site, without naming the host.
 *
 * `request.url` inside the container is `http://0.0.0.0:3000`, so an absolute
 * url built from it sends the visitor somewhere only the machine can reach.
 */
const redirectTo = (path: string) =>
  new NextResponse(null, { status: 303, headers: { location: path } });

/** Back to the form, saying only that it did not work */
const backToLogin = (from: string, error: MemberLoginError) =>
  redirectTo(`${MEMBER_LOGIN_PATH}?${new URLSearchParams({ from, error })}`);

/**
 * Sign a visitor in to this site.
 *
 * Answers with a redirect either way, so the response shape tells a guesser
 * nothing — the cookie is the only difference between a good password and a
 * bad one. The session cookie itself is built by Payload, so its name, expiry
 * and flags match the ones the rest of the system already issues.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = resolveReturnPath(String(form.get('from') ?? '/'));

  const attempts = `${clientIp(request.headers) ?? 'unknown'}:member-login`;

  // Refuse a caller already over the limit before hashing anything: the
  // comparison is deliberately slow, and that cost is what a flood buys
  if (isRateLimited(attempts, { limit: ATTEMPTS_PER_ADDRESS })) {
    return backToLogin(from, 'throttled');
  }

  const { payload } = await payloadRuntime();

  const session = await loginMember(payload, {
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? '')
  });

  // Only a failure costs an attempt, so a shared address is not throttled for
  // signing in successfully
  if (!session) {
    const attempt = rateLimit(attempts, { limit: ATTEMPTS_PER_ADDRESS });

    return backToLogin(from, attempt.ok ? 'failed' : 'throttled');
  }

  const config = await configPromise;
  const response = redirectTo(from);

  response.headers.append(
    'Set-Cookie',
    generatePayloadCookie({
      collectionAuthConfig: usersAuthConfig(config),
      cookiePrefix: config.cookiePrefix,
      token: session.token
    })
  );

  return response;
}
