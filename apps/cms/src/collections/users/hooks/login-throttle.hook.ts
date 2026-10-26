import { customT } from '@codeware/app-cms/util/i18n';
import { clientIp, rateLimit } from '@codeware/shared/util/human-check';
import { APIError, type CollectionBeforeOperationHook } from 'payload';

/**
 * Logins one address may try in the window, successful or not.
 *
 * Payload's own lock is per account, which stops guessing one password but
 * not a spray of one password across many addresses, and lets anyone lock a
 * known address out for a day. An office of editors signing in at once stays
 * far below this; a script does not.
 */
const LOGINS_PER_ADDRESS = 20;

/**
 * Throttle REST and GraphQL logins per address.
 *
 * Counted before the password is checked, so a refused caller costs no hash.
 * A Local API login carries no address and is not counted here: the site's
 * member login is, by its own route, which only counts failures.
 */
export const loginThrottleHook: CollectionBeforeOperationHook<'users'> = ({
  args,
  operation,
  req
}) => {
  if (operation !== 'login') {
    return args;
  }

  const address = req.headers ? clientIp(req.headers) : undefined;

  // Without an address every caller would share one bucket, and ten typos
  // anywhere would lock the whole admin out
  if (!address) {
    return args;
  }

  const attempt = rateLimit(`${address}:users-login`, {
    limit: LOGINS_PER_ADDRESS
  });

  if (!attempt.ok) {
    throw new APIError(
      customT(req.t)('authentication:tooManyLoginAttempts'),
      429,
      { retryAfterSeconds: attempt.retryAfterSeconds },
      true
    );
  }

  return args;
};
