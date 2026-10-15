/** Where the platform's signup is reached */
export const SIGNUP_PATH = '/signup';

/**
 * Where the signup page actually lives. A static `/signup` route would shadow
 * a tenant's own page of that name on every tenant site, so the page has an
 * unlikely path and the proxy points `/signup` at it on the host only.
 */
export const PLATFORM_SIGNUP_PATH = '/platform-signup';

/** The page to rewrite `/signup` to, or null when the request is not one */
export const signupRewrite = (
  pathname: string,
  env: Record<string, string | undefined>
): string | null =>
  pathname === SIGNUP_PATH && !env['TENANT_ID'] ? PLATFORM_SIGNUP_PATH : null;
