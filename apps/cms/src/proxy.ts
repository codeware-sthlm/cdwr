import {
  SITE_GATE_COOKIE,
  verifySiteGateToken
} from '@codeware/shared/util/site-gate';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { FORCE_LOGOUT_PATH, SESSION_COOKIES } from './utils/force-logout';
import { SITE_GATE_PATH, isGatedPath } from './utils/site-gate';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Force logout — drops the session cookies and lands on the login screen.
  //
  // Runs before Payload's auth, so it cannot 401 the way Payload's own logout
  // does when the session is already being refused. Reachable by url alone,
  // which is what makes it something support can hand to a locked-out user.
  if (pathname === FORCE_LOGOUT_PATH) {
    const response = NextResponse.redirect(
      new URL('/admin/login', request.url)
    );
    for (const cookie of SESSION_COOKIES) {
      response.cookies.delete(cookie);
    }
    return response;
  }

  // Maintenance mode — serve maintenance page for all routes except the health
  // endpoint (so Fly health checks pass) and the maintenance page itself
  // (to avoid an infinite rewrite loop).
  if (
    process.env.MAINTENANCE_MODE === 'true' &&
    pathname !== '/api/health' &&
    pathname !== '/maintenance' &&
    pathname !== '/cdwr-cloud.png'
  ) {
    return NextResponse.rewrite(new URL('/maintenance', request.url));
  }

  // Whole-site gate — a tenant site that is not open to the public yet.
  //
  // Read from `process.env` on every request rather than once at module scope:
  // the env loader injects the tenant's secrets at boot, which is after this
  // module is first evaluated. No password means the site is public.
  const gatePassword = process.env.SITE_GATE_PASSWORD;

  if (gatePassword && isGatedPath(pathname)) {
    const token = request.cookies.get(SITE_GATE_COOKIE)?.value;

    if (!verifySiteGateToken(token, gatePassword)) {
      // Anything not asking for a page — a crawler, a script — gets a refusal
      // rather than a form, and a status it can act on
      if (!request.headers.get('accept')?.includes('text/html')) {
        return new NextResponse(null, {
          status: 401,
          headers: { 'x-robots-tag': 'noindex' }
        });
      }

      const gate = new URL(SITE_GATE_PATH, request.url);
      gate.searchParams.set('from', `${pathname}${request.nextUrl.search}`);

      return NextResponse.rewrite(gate, {
        headers: { 'x-robots-tag': 'noindex' }
      });
    }
  }

  // Clear Next.js draft mode when the Payload session has expired or been cleared.
  //
  // `/api/preview` enables draft mode (sets `__prerender_bypass`) so Payload's
  // live preview can fetch draft content. Payload's logout only clears its own
  // `payload-token` cookie — the draft cookie persists, causing site pages to
  // keep rendering in draft mode after logout, which produces empty or broken
  // content for unauthenticated visitors.
  if (
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/maintenance')
  ) {
    const hasDraftCookie = request.cookies.has('__prerender_bypass');
    const hasPayloadToken = request.cookies.has('payload-token');

    if (hasDraftCookie && !hasPayloadToken) {
      const response = NextResponse.redirect(request.url);
      response.cookies.delete('__prerender_bypass');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Next.js internals — all other routes including admin and api
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
