import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  clientIp,
  isRateLimited,
  rateLimit
} from '@codeware/shared/util/human-check';
import {
  SITE_GATE_COOKIE,
  SITE_GATE_MAX_AGE_SECONDS,
  createSiteGateToken,
  isSecureRequest,
  matchesSiteGatePassword,
  resolveReturnPath
} from '@codeware/shared/util/site-gate';
import { type NextRequest, NextResponse } from 'next/server';

import { SITE_GATE_PATH } from '../../../utils/site-gate';

/** A shared password is guessable at speed unless something counts the tries */
const ATTEMPTS_PER_ADDRESS = 10;

/**
 * Redirect to a path on this site, without naming the host.
 *
 * `request.url` inside the container is `http://0.0.0.0:3000`, so building an
 * absolute url from it sends the visitor to an address only the machine can
 * reach. A relative Location is allowed and lands wherever they already are.
 */
const redirectTo = (path: string) =>
  new NextResponse(null, { status: 303, headers: { location: path } });

/** Back to the form, saying only that it did not open */
const backToGate = (from: string, error: 'throttled' | 'wrong') => {
  const gate = new URLSearchParams({ from, error });

  return redirectTo(`${SITE_GATE_PATH}?${gate}`);
};

/**
 * Open a gated site for a visitor who knows the password.
 *
 * Answers with a redirect either way, so the response shape says nothing: the
 * cookie is the only difference between knowing the password and not. What
 * the browser gets is a signed token, never the password itself.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = resolveReturnPath(String(form.get('from') ?? '/'));
  const password = getEnv(false)?.SITE_GATE?.password;

  // Nothing to open — this site is public, so send them on their way
  if (!password) {
    return redirectTo(from);
  }

  const attempts = `${clientIp(request.headers) ?? 'unknown'}:site-gate`;

  // Refuse a caller who is already over the limit before deriving anything:
  // the comparison is deliberately slow, and that cost is what a flood buys
  if (isRateLimited(attempts, { limit: ATTEMPTS_PER_ADDRESS })) {
    return backToGate(from, 'throttled');
  }

  // Only a wrong guess costs an attempt. Counting every submit would throttle
  // an office behind one address for knowing the password
  if (
    !(await matchesSiteGatePassword(
      String(form.get('password') ?? ''),
      password
    ))
  ) {
    const attempt = rateLimit(attempts, { limit: ATTEMPTS_PER_ADDRESS });

    return backToGate(from, attempt.ok ? 'wrong' : 'throttled');
  }

  const response = redirectTo(from);

  response.cookies.set({
    name: SITE_GATE_COOKIE,
    value: createSiteGateToken(password),
    httpOnly: true,
    maxAge: SITE_GATE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isSecureRequest(request.headers, request.url)
  });

  return response;
}
