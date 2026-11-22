import type { AuthStrategy } from 'payload';

import { readCookie, trustCookieName } from './trust-cookie';
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
      const token = readCookie(
        headers,
        trustCookieName(payload.config.cookiePrefix)
      );
      if (!token) {
        return { user: null };
      }
      const claims = await verifyTrustToken(token, payload.secret);
      if (!claims) {
        return { user: null };
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
        return { user: null };
      }

      const state = await readTrustState(payload, user.id);
      if (
        !state ||
        secretHash(state.totpSecret) !== claims.secretHash ||
        state.trustEpoch !== claims.trustEpoch
      ) {
        return { user: null };
      }
      return { user: { ...user, _strategy: 'totp' } };
    } catch {
      return { user: null };
    }
  }
};
