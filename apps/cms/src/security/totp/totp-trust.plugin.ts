import type { Plugin } from 'payload';
import type { payloadTotp } from 'payload-totp';

import { totpTrustStrategy } from './totp-trust.strategy';
import { setTrustCookie } from './trust-cookie';
import { readTrustState } from './trust-state';
import { secretHash, signTrustToken } from './trust-token';

type AfterVerify = NonNullable<
  NonNullable<Parameters<typeof payloadTotp>[0]>['afterVerify']
>;

/**
 * Remembers this device after a correct code when the box was ticked.
 * The cookie is the only thing it sets.
 */
export const totpTrustAfterVerify: AfterVerify = async ({
  body,
  req,
  user
}) => {
  if (body.trust !== true && body.trust !== 'true') {
    return;
  }
  const { payload } = req;
  // A cookie that cannot be set must not turn a correct code into an error
  try {
    const state = await readTrustState(payload, user.id);
    if (!state) {
      return;
    }
    const token = await signTrustToken(
      {
        userId: user.id,
        secretHash: secretHash(state.totpSecret),
        trustEpoch: state.trustEpoch
      },
      payload.secret
    );
    await setTrustCookie({
      payload,
      collectionAuth: payload.collections['users'].config.auth,
      token
    });
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[totpTrust] Could not trust the device of user ${user.id}`
    );
  }
};

/**
 * Adds the trusted-device strategy to `users`, right after the plugin's
 * own. List it after `payloadTotp`, which adds that one.
 */
export const totpTrustPlugin: Plugin = (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) => {
    if (collection.slug !== 'users' || typeof collection.auth !== 'object') {
      return collection;
    }
    const strategies = collection.auth.strategies ?? [];
    const at = strategies.findIndex((strategy) => strategy.name === 'totp');
    if (at < 0) {
      throw new Error('totpTrustPlugin must be listed after payloadTotp');
    }
    return {
      ...collection,
      auth: {
        ...collection.auth,
        strategies: [
          ...strategies.slice(0, at + 1),
          totpTrustStrategy,
          ...strategies.slice(at + 1)
        ]
      }
    };
  })
});
