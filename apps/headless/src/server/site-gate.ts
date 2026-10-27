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

/** Where the gate asks for the password, and where its form posts */
export const SITE_GATE_PATH = '/site-gate';

/** A shared password is guessable at speed unless something counts the tries */
const ATTEMPTS_PER_ADDRESS = 10;

/**
 * Guesses per address still being checked. The comparison is slow on purpose,
 * so parallel submissions would all pass the limit before any failure is
 * counted; holding a place for each one keeps the limit at ten.
 */
const inFlight = new Map<string, number>();

/**
 * Whether the gate stands in front of this path: all of them but its own.
 *
 * Not the cms's `isGatedPath`, which exempts `/api` and anything with a file
 * extension. Here the router answers those: `/x.js` renders the not-found
 * page with the whole site's data, and `/_serverFn/<id>/a.js` still runs the
 * server function. Real static files (`/assets/*`, `public/`) never get this
 * far, as Nitro serves them before the request handler, so nothing needs to
 * be exempt.
 */
export const isGatedPath = (pathname: string): boolean =>
  pathname !== SITE_GATE_PATH;

const localeFrom = (request: Request): SupportedLocale =>
  (request.headers.get('accept-language') ?? '').toLowerCase().startsWith('sv')
    ? 'sv'
    : 'en';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

/**
 * The gate page, as a document of its own: no script, a plain form post.
 *
 * Not a route of the app: the root route loads the tenant's site and renders
 * its chrome, and the gate is the platform speaking, in front of all that.
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
      h1 { margin: 0; font-size: 1.5rem; }
      p { margin: 1rem 0 0; opacity: 0.7; }
      form { display: flex; gap: 0.5rem; margin-top: 2rem; }
      input {
        flex: 1; box-sizing: border-box; padding: 0.625rem 0.75rem;
        font: inherit; color: inherit; background: transparent;
        border: 1px solid currentColor; border-radius: 0.375rem;
      }
      button {
        padding: 0.625rem 1rem; font: inherit; cursor: pointer;
        color: inherit; background: transparent;
        border: 1px solid currentColor; border-radius: 0.375rem;
      }
      .error { font-size: 0.875rem; font-weight: 500; opacity: 1; }
    </style>
  </head>
  <body>
    <main>
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
        <button type="submit">${escape(t(locale, 'siteGate.submit'))}</button>
      </form>
      ${message ? `<p class="error" role="alert">${escape(message)}</p>` : ''}
    </main>
  </body>
</html>`;
}

const redirect = (location: string, status: 302 | 303, cookie?: string) =>
  new Response(null, {
    status,
    headers: {
      location,
      ...(cookie ? { 'set-cookie': cookie } : {})
    }
  });

/** Open the site for a visitor who knows the password */
async function handleSubmit(request: Request, password: string) {
  const form = await request.formData().catch(() => new FormData());
  const from = resolveReturnPath(form.get('from'));
  const submitted = form.get('password');

  const attempts = `${clientIp(request.headers) ?? 'unknown'}:site-gate`;
  const refuse = (error: 'throttled' | 'wrong') =>
    redirect(
      `${SITE_GATE_PATH}?from=${encodeURIComponent(from)}&error=${error}`,
      303
    );

  // Refuse a caller who is already over the limit before deriving anything:
  // the comparison is deliberately slow, and that cost is what a flood buys
  const pending = inFlight.get(attempts) ?? 0;
  if (
    pending >= ATTEMPTS_PER_ADDRESS ||
    isRateLimited(attempts, { limit: ATTEMPTS_PER_ADDRESS - pending })
  ) {
    return refuse('throttled');
  }

  inFlight.set(attempts, pending + 1);
  let matches: boolean;
  try {
    matches =
      typeof submitted === 'string' &&
      (await matchesSiteGatePassword(submitted, password));
  } finally {
    const left = (inFlight.get(attempts) ?? 1) - 1;
    if (left > 0) {
      inFlight.set(attempts, left);
    } else {
      inFlight.delete(attempts);
    }
  }

  if (!matches) {
    // Only a wrong guess costs an attempt, so an office behind one address is
    // not throttled for knowing the password
    const attempt = rateLimit(attempts, { limit: ATTEMPTS_PER_ADDRESS });

    return refuse(attempt.ok ? 'wrong' : 'throttled');
  }

  const cookie = [
    `${SITE_GATE_COOKIE}=${createSiteGateToken(password)}`,
    'HttpOnly',
    `Max-Age=${SITE_GATE_MAX_AGE_SECONDS}`,
    'Path=/',
    'SameSite=Lax',
    ...(isSecureRequest(request.headers, request.url) ? ['Secure'] : [])
  ].join('; ');

  // A relative location: inside the container the request url names
  // `0.0.0.0`, which is an address only this machine can reach
  return redirect(from, 303, cookie);
}

const cookieValue = (request: Request, name: string): string | undefined =>
  request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/**
 * Stand in front of a site that is not open to the public yet.
 *
 * The counterpart of the cms proxy's gate, sharing its token helpers so the
 * two cannot drift apart.
 *
 * @returns The response that answers instead of the site, or `undefined` to
 *   let the request through
 */
export async function siteGate(
  request: Request,
  password: string | undefined
): Promise<Response | undefined> {
  if (!password) {
    return undefined;
  }

  const url = new URL(request.url);
  const { pathname, search } = url;

  if (pathname === SITE_GATE_PATH) {
    if (request.method === 'POST') {
      return handleSubmit(request, password);
    }

    return new Response(
      gatePage(
        localeFrom(request),
        resolveReturnPath(url.searchParams.get('from')),
        url.searchParams.get('error')
      ),
      {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-robots-tag': 'noindex'
        }
      }
    );
  }

  if (!isGatedPath(pathname)) {
    return undefined;
  }

  if (verifySiteGateToken(cookieValue(request, SITE_GATE_COOKIE), password)) {
    return undefined;
  }

  // Anything not asking for a page — a crawler, a script, a server function
  // call from a visitor who never got in — gets a refusal
  if (!request.headers.get('accept')?.includes('text/html')) {
    return new Response(null, {
      status: 401,
      headers: { 'x-robots-tag': 'noindex' }
    });
  }

  return redirect(
    `${SITE_GATE_PATH}?from=${encodeURIComponent(`${pathname}${search}`)}`,
    302
  );
}
