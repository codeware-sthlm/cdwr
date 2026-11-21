/**
 * Path that clears an admin session without going through Payload.
 *
 * Handled in `proxy.ts`, which runs before Payload's auth and so still works
 * when the deployment refuses the cookie and every authenticated request 401s.
 * Payload's own `logOut()` cannot cover that case: it skips the logout request
 * entirely when the client has no user, which is exactly the stuck state.
 */
export const FORCE_LOGOUT_PATH = '/admin/force-logout';

/** Cookies that together make up an admin session. */
export const SESSION_COOKIES = [
  'payload-token',
  // `payload-totp`'s verified second factor, which outlives the session cookie
  'payload-totp',
  // Multi-tenant plugin's selected workspace
  'payload-tenant',
  // Next.js draft mode, enabled through `/api/preview` for live preview
  '__prerender_bypass'
] as const;
