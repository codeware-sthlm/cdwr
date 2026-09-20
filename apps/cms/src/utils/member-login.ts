import type { SanitizedConfig } from 'payload';

/** Where a visitor signs in to reach members-only content */
export const MEMBER_LOGIN_PATH = '/login';

/** Where its form posts */
export const MEMBER_LOGIN_SUBMIT_PATH = '/api/member-login';

/** Where signing out posts */
export const MEMBER_LOGOUT_SUBMIT_PATH = '/api/member-logout';

/**
 * Reasons the login page reports back.
 *
 * Deliberately coarse: a wrong password, an unknown address and a locked
 * account are all `failed`, so the form cannot be used to discover which
 * addresses belong to this workspace.
 */
export type MemberLoginError = 'failed' | 'throttled';

/**
 * Auth config of the `users` collection, which both session cookies are built
 * from.
 *
 * Throws rather than falling back: without it Payload would mint a cookie with
 * default flags, and a session cookie with the wrong `secure` or expiry is the
 * kind of fault that only shows up in production.
 */
export const usersAuthConfig = (config: SanitizedConfig) => {
  const users = config.collections.find(({ slug }) => slug === 'users');

  if (!users) {
    throw new Error(
      'The users collection is missing from the Payload config, so no session cookie can be issued.'
    );
  }

  return users.auth;
};

/**
 * Whether a form post came from this site.
 *
 * Both routes act on a session: logout expires the `payload-token` cookie,
 * which is the *same* cookie the admin panel uses, so a third-party page that
 * could post here would sign an editor out of the admin. Login is the mirror —
 * an attacker could sign a visitor into an account of their choosing.
 *
 * `Sec-Fetch-Site` is sent by every browser that can make this request, and a
 * page cannot forge it. `Origin` is checked too for anything older — browsers
 * send it on every POST, same-origin ones included.
 *
 * With neither header this refuses. Something has to prove the post came from
 * here, and "no evidence" is not that proof: an attacker controls what their
 * page sends but cannot add these headers, so the only callers a refusal costs
 * are non-browser ones, which have no session cookie to spend anyway.
 */
export const isSameOriginPost = (request: Request): boolean => {
  const site = request.headers.get('sec-fetch-site');

  if (site) {
    return site === 'same-origin';
  }

  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    // The `Host` header is what the proxy forwarded, so it is the host the
    // browser actually asked for; `request.url` can carry the internal one
    const host = request.headers.get('host') ?? new URL(request.url).host;

    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
