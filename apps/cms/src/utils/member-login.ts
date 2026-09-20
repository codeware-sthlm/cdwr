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
