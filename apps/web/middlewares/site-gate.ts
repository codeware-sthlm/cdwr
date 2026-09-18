import {
  clientIp,
  isRateLimited,
  rateLimit
} from '@codeware/shared/util/human-check';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import {
  SITE_GATE_COOKIE,
  SITE_GATE_MAX_AGE_SECONDS,
  createSiteGateToken,
  isSecureRequest,
  matchesSiteGatePassword,
  resolveReturnPath,
  verifySiteGateToken
} from '@codeware/shared/util/site-gate';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

import env from '../env-resolver/env';

/** Where the gate asks for the password */
export const SITE_GATE_PATH = '/site-gate';

/** A shared password is guessable at speed unless something counts the tries */
const ATTEMPTS_PER_ADDRESS = 10;

/**
 * Paths the gate never answers for: the Hono routes Fly checks the app with.
 * A path ending in a file extension is a public asset, `robots.txt` among
 * them. Everything else is closed, the app's own form endpoints included — a
 * visitor through the gate carries the cookie, and one who is not has no
 * business posting to a site that is not open.
 */
const OPEN_PATHS = ['/api'];

const ASSET = /\.[a-z0-9]+$/i;

const isGatedPath = (pathname: string): boolean =>
  pathname !== SITE_GATE_PATH &&
  !ASSET.test(pathname) &&
  !OPEN_PATHS.some(
    (open) => pathname === open || pathname.startsWith(`${open}/`)
  );

const localeFrom = (c: Context): SupportedLocale =>
  (c.req.header('accept-language') ?? '').toLowerCase().startsWith('sv')
    ? 'sv'
    : 'en';

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] as string
  );

/**
 * The gate page, as a document of its own.
 *
 * Deliberately not a Remix route: the client router fetches a route's data
 * with a request that does not accept HTML, which the refusal below would
 * turn into a 401 — breaking both the site's own navigation and this form.
 * The gate is also the platform speaking, not the tenant, so it carries none
 * of the site's chrome.
 */
function gatePage(
  locale: SupportedLocale,
  from: string,
  error: string | null
): string {
  const message =
    error === 'throttled'
      ? t(locale, 'siteGate.tooManyAttempts')
      : error
        ? t(locale, 'siteGate.wrongPassword')
        : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escape(t(locale, 'siteGate.heading'))}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center;
        justify-content: center; text-align: center; padding: 1.5rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #f4f4f5; color: #1c1c28;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #101014; color: #e8e8ea; }
      }
      main { width: 100%; max-width: 28rem; }
      svg { opacity: 0.4; }
      h1 { margin: 1.5rem 0 0; font-size: 1.5rem; }
      p { margin: 1rem 0 0; opacity: 0.7; }
      form { position: relative; margin-top: 2rem; }
      input {
        width: 100%; box-sizing: border-box; padding: 0.625rem 3rem;
        text-align: center; font: inherit; color: inherit;
        background: rgba(255, 255, 255, 0.8); border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 0.375rem;
      }
      @media (prefers-color-scheme: dark) {
        input { background: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); }
      }
      button {
        position: absolute; top: 50%; right: 0.5rem; transform: translateY(-50%);
        display: flex; padding: 0.375rem; border: 0; border-radius: 0.375rem;
        background: none; color: inherit; opacity: 0.6; cursor: pointer;
      }
      button:hover { opacity: 1; }
      .error { font-size: 0.875rem; font-weight: 500; opacity: 1; }
    </style>
  </head>
  <body>
    <main>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <h1>${escape(t(locale, 'siteGate.heading'))}</h1>
      <p>${escape(t(locale, 'siteGate.intro'))}</p>
      <form method="post" action="${SITE_GATE_PATH}">
        <input type="hidden" name="from" value="${escape(from)}" />
        <label for="site-gate-password" hidden>${escape(t(locale, 'siteGate.password'))}</label>
        <input
          id="site-gate-password"
          type="password"
          name="password"
          autocomplete="current-password"
          autofocus
          required
          placeholder="${escape(t(locale, 'siteGate.password'))}"
        />
        <button type="submit" aria-label="${escape(t(locale, 'siteGate.submit'))}" title="${escape(t(locale, 'siteGate.submit'))}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        </button>
      </form>
      ${message ? `<p class="error" role="alert">${escape(message)}</p>` : ''}
    </main>
  </body>
</html>`;
}

/** Open the site for a visitor who knows the password */
async function handleSubmit(c: Context, password: string) {
  const body = await c.req.parseBody();
  const from = resolveReturnPath(body['from']);
  const submitted =
    typeof body['password'] === 'string' ? body['password'] : '';

  const attempts = `${clientIp(c.req.raw.headers) ?? 'unknown'}:site-gate`;
  const refuse = (error: 'throttled' | 'wrong') =>
    c.redirect(
      `${SITE_GATE_PATH}?from=${encodeURIComponent(from)}&error=${error}`,
      303
    );

  // Refuse a caller who is already over the limit before deriving anything:
  // the comparison is deliberately slow, and that cost is what a flood buys
  if (isRateLimited(attempts, { limit: ATTEMPTS_PER_ADDRESS })) {
    return refuse('throttled');
  }

  if (!(await matchesSiteGatePassword(submitted, password))) {
    // Only a wrong guess costs an attempt, so an office behind one address is
    // not throttled for knowing the password
    const attempt = rateLimit(attempts, { limit: ATTEMPTS_PER_ADDRESS });

    return refuse(attempt.ok ? 'wrong' : 'throttled');
  }

  setCookie(c, SITE_GATE_COOKIE, createSiteGateToken(password), {
    httpOnly: true,
    maxAge: SITE_GATE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure: isSecureRequest(c.req.raw.headers, c.req.url)
  });

  // A relative location: inside the container the request url names
  // `0.0.0.0`, which is an address only this machine can reach
  return c.redirect(from, 303);
}

/**
 * Stand in front of a site that is not open to the public yet.
 *
 * The counterpart of the cms proxy's gate, sharing its token helpers so the
 * two cannot drift apart. No password configured means the site is public and
 * this costs one property read.
 */
export const siteGateMiddleware = createMiddleware(async (c, next) => {
  const password = env.SITE_GATE_PASSWORD;

  if (!password) {
    await next();
    return;
  }

  const { pathname, search } = new URL(c.req.url);

  if (pathname === SITE_GATE_PATH) {
    if (c.req.method === 'POST') {
      return handleSubmit(c, password);
    }

    const params = new URL(c.req.url).searchParams;

    return c.html(
      gatePage(
        localeFrom(c),
        resolveReturnPath(params.get('from')),
        params.get('error')
      ),
      200,
      { 'x-robots-tag': 'noindex' }
    );
  }

  if (!isGatedPath(pathname)) {
    await next();
    return;
  }

  if (verifySiteGateToken(getCookie(c, SITE_GATE_COOKIE), password)) {
    await next();
    return;
  }

  // Anything not asking for a page — a crawler, a script, the client router
  // of a visitor who never got in — gets a refusal
  if (!c.req.header('accept')?.includes('text/html')) {
    return c.body(null, 401, { 'x-robots-tag': 'noindex' });
  }

  return c.redirect(
    `${SITE_GATE_PATH}?from=${encodeURIComponent(`${pathname}${search}`)}`,
    302
  );
});
