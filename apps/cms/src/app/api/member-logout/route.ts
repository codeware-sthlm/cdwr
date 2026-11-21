import { type NextRequest, NextResponse } from 'next/server';
import { generateExpiredPayloadCookie } from 'payload/shared';

import configPromise from '../../../payload.config';
import { isSameOriginPost, usersAuthConfig } from '../../../utils/member-login';

/**
 * Sign a visitor out of this site.
 *
 * Expiring the cookie is the whole mechanism — Payload sessions are the token
 * in that cookie, so dropping it ends the session. The visitor keeps browsing
 * as the public does.
 *
 * **Always lands on the home page, never back where they were.** Signing out
 * can only narrow what a visitor may read, so the page they were on may have
 * just stopped existing for them — returning to a members-only page answers
 * 404. Signing *in* is the opposite: it only ever widens access, so that side
 * does return the visitor to where they were.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const config = await configPromise;

  const response = new NextResponse(null, {
    status: 303,
    headers: { location: '/' }
  });

  const expiredSession = generateExpiredPayloadCookie({
    collectionAuthConfig: usersAuthConfig(config),
    cookiePrefix: config.cookiePrefix
  });

  response.headers.append('Set-Cookie', expiredSession);
  // `payload-totp` marks the second factor done in a cookie of its own, set
  // with the same flags. Left behind, it would let the next password-only
  // sign-in in this browser skip the code
  response.headers.append(
    'Set-Cookie',
    expiredSession.replace(
      `${config.cookiePrefix}-token=`,
      `${config.cookiePrefix}-totp=`
    )
  );

  return response;
}
