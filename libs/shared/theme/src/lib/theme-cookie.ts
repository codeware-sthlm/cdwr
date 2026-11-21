/**
 * Where the visitor's theme choice is kept.
 *
 * A cookie rather than `localStorage` so the server can render the right theme
 * on first paint — reading it on the client would flash the default first.
 *
 * Owner-prefixed kebab-case, matching Payload's own `payload-token` /
 * `payload-tenant`.
 *
 * Shared, because two places have to agree on it: the cms site and
 * `cdwr tenant snapshot`, which sets it the way a visitor would.
 */
export const THEME_COOKIE = 'cdwr-theme';

/** One year. */
export const THEME_COOKIE_MAX_AGE = 31536000;
