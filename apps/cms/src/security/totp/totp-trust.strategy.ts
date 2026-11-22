import type { AuthStrategy } from 'payload';

import {
  expiredTrustCookie,
  readCookie,
  trustCookieName
} from './trust-cookie';
import { readTrustState } from './trust-state';
import { secretHash, verifyTrustToken } from './trust-token';

const PASSWORD_SESSION_STRATEGY = 'local-jwt';

/**
 * A password session on a trusted device counts as verified. Needs the
 * trust cookie, a password session for the same user, and a token that
 * still matches the user's secret and trust epoch.
 */
export const totpTrustStrategy: AuthStrategy = {
  name: 'totp-trust',
  authenticate: async (args) => {
    const { headers, payload } = args;
    try {
      const cookieName = trustCookieName(payload.config.cookiePrefix);
      const token = readCookie(headers, cookieName);
      // A cookie that can no longer vouch for anyone is expired on the way out
      const stale = () => ({
        user: null,
        responseHeaders: new Headers({
          'Set-Cookie': expiredTrustCookie({
            payload,
            collectionAuth: payload.collections['users'].config.auth
          })
        })
      });
      if (!token) {
        return { user: null };
      }
      const claims = await verifyTrustToken(token, payload.secret);
      if (!claims) {
        return stale();
      }

      const passwordSession = payload.authStrategies.find(
        (strategy) => strategy.name === PASSWORD_SESSION_STRATEGY
      );
      const { user } = (await passwordSession?.authenticate(args)) ?? {};
      if (
        !user ||
        user.collection !== 'users' ||
        String(user.id) !== String(claims.userId)
      ) {
        return user ? stale() : { user: null };
      }

      const state = await readTrustState(payload, user.id);
      if (
        !state ||
        secretHash(state.totpSecret) !== claims.secretHash ||
        state.trustEpoch !== claims.trustEpoch
      ) {
        return stale();
      }
      return { user: { ...user, _strategy: 'totp' } };
    } catch {
      return { user: null };
    }
  }
};
