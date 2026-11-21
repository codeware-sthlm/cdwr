import { getUserTenantIDs, hasRole, isUser } from '@codeware/app-cms/util/misc';
import type { UserAny } from '@codeware/shared/util/payload-types';

/**
 * What an authenticated request carries beyond the user document:
 * `_strategy` is set by Payload, `hasTotp` by `payload-totp`.
 */
type SessionUser = UserAny & { _strategy?: string; hasTotp?: boolean };

/**
 * Whether the request's strategy already satisfies the second factor.
 *
 * `totp` counts only while the user has a secret: its cookie outlives a reset
 * (`resetTotp`) and would otherwise vouch for the user's next password session,
 * skipping the enrolment the reset asks for.
 */
const isVerifiedStrategy = ({ _strategy, hasTotp }: SessionUser): boolean =>
  _strategy === 'api-key' || (_strategy === 'totp' && Boolean(hasTotp));

/**
 * The seeded users, when the environment asks for it. The env schema allows the
 * flag in development, and in preview only with a secret `SEED_PASSWORD`.
 */
const isExemptSeededUser = (user: UserAny | null): boolean =>
  process.env['TOTP_EXEMPT_SEEDED_USERS'] === 'true' &&
  isUser(user) &&
  user.email.endsWith('@local.dev');

/**
 * System users and workspace admins must enrol in TOTP; members may.
 */
export const mustEnrolTotp = (user: UserAny | null): boolean =>
  !isExemptSeededUser(user) &&
  (hasRole(user, 'system-user') || getUserTenantIDs(user, 'admin').length > 0);

/**
 * Whether a signed-in user still owes TOTP setup before using the cms.
 *
 * Only a user authenticated by a request counts: Payload sets `_strategy`
 * there, while a user document passed to the Local API by our own code has
 * none and is left alone.
 */
export const isTotpSetupPending = (
  user: UserAny | null | undefined
): boolean => {
  if (!isUser(user ?? null)) {
    return false;
  }
  const session = user as SessionUser;
  if (!session._strategy || isVerifiedStrategy(session) || session.hasTotp) {
    return false;
  }
  return mustEnrolTotp(user ?? null);
};

/**
 * Whether a signed-in user has not completed the second factor in this
 * session: enrolled but no code entered yet, or required to enrol and not
 * enrolled. Use it wherever code trusts `req.user` outside access control,
 * such as custom endpoints and server components.
 */
export const isSecondFactorPending = (
  user: UserAny | null | undefined
): boolean => {
  if (!isUser(user ?? null)) {
    return false;
  }
  const session = user as SessionUser;
  if (!session._strategy || isVerifiedStrategy(session)) {
    return false;
  }
  return Boolean(session.hasTotp) || isTotpSetupPending(user);
};
