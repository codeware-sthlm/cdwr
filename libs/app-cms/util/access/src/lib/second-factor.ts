import { getUserTenantIDs, hasRole, isUser } from '@codeware/app-cms/util/misc';
import type { UserAny } from '@codeware/shared/util/payload-types';

/**
 * What an authenticated request carries beyond the user document:
 * `_strategy` is set by Payload, `hasTotp` by `payload-totp`.
 */
type SessionUser = UserAny & { _strategy?: string; hasTotp?: boolean };

/** Strategies that already satisfy the second factor */
const verifiedStrategies: ReadonlyArray<string> = ['totp', 'api-key'];

/**
 * System users and workspace admins must enrol in TOTP; members may.
 */
export const mustEnrolTotp = (user: UserAny | null): boolean =>
  hasRole(user, 'system-user') || getUserTenantIDs(user, 'admin').length > 0;

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
  const { _strategy, hasTotp } = user as SessionUser;
  if (!_strategy || verifiedStrategies.includes(_strategy) || hasTotp) {
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
  const { _strategy, hasTotp } = user as SessionUser;
  if (!_strategy || verifiedStrategies.includes(_strategy)) {
    return false;
  }
  return Boolean(hasTotp) || isTotpSetupPending(user);
};
