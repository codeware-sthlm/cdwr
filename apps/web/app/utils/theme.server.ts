import { THEME_COOKIE } from '@codeware/shared/theme';
import { createCookie } from '@remix-run/node';

// Named once for every client of the platform; see `THEME_COOKIE`
const cookie = createCookie(THEME_COOKIE);

/**
 * Get the theme from the 'cdwr-theme' cookie if present.
 *
 * @param request The incoming request
 *
 * @returns The visitor's chosen theme or null if it is not set
 */
export async function getTheme(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const parsed: string | null = cookieHeader
    ? await cookie.parse(cookieHeader)
    : null;

  return typeof parsed === 'string' && parsed ? parsed : null;
}

/**
 * Set the theme cookie with the given value.
 *
 * @param theme The theme to set
 *
 * @returns The serialized cookie header
 */
export async function setTheme(theme: string) {
  // One year, matching the color scheme cookie.
  return await cookie.serialize(theme, { path: '/', maxAge: 31536000 });
}
