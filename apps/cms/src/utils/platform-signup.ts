/** Where the platform's signup is reached */
export const SIGNUP_PATH = '/signup';

/**
 * Where the signup page actually lives. A static `/signup` route would shadow
 * a tenant's own page of that name on every tenant site, so the page has an
 * unlikely path and the proxy points `/signup` at it on the host only.
 */
export const PLATFORM_SIGNUP_PATH = '/platform-signup';

/** Where a new confirmation mail is asked for */
export const SIGNUP_RESEND_PATH = '/signup/resend';

/** Where the resend page actually lives */
export const PLATFORM_SIGNUP_RESEND_PATH = '/platform-signup/resend';

const REWRITES: Record<string, string> = {
  [SIGNUP_PATH]: PLATFORM_SIGNUP_PATH,
  [SIGNUP_RESEND_PATH]: PLATFORM_SIGNUP_RESEND_PATH
};

/** The page to rewrite a signup path to, or null when the request is not one */
export const signupRewrite = (
  pathname: string,
  env: Record<string, string | undefined>
): string | null => (env['TENANT_ID'] ? null : (REWRITES[pathname] ?? null));
