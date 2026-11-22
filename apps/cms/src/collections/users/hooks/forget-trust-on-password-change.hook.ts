import { nextTrustEpoch } from '@codeware/app-cms/data-access';
import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeChangeHook } from 'payload';

/**
 * A new password forgets every trusted device of the user, as
 * **Forget all trusted devices** does: a fresh random trust epoch.
 *
 * Set in the same write. At collection `beforeChange` the password is still
 * plain text in `data` (Payload hashes it afterwards), and field access was
 * checked in the fields `beforeValidate` pass before it, so the epoch set
 * here is saved although nobody may write it. A create is left alone, since
 * a new user has no trusted device. A password reset never runs this hook;
 * see `forgetTrustOnPasswordResetHook`. Nor does the reset hook's
 * `beforeValidate` case fire on an update, which always has an `originalDoc`.
 */
export const forgetTrustOnPasswordChangeHook: CollectionBeforeChangeHook<
  User
> = ({ data, operation, originalDoc }) => {
  if (operation !== 'update') {
    return data;
  }

  const password: unknown = data.password;

  if (typeof password !== 'string' || !password) {
    return data;
  }

  return { ...data, trustEpoch: nextTrustEpoch(originalDoc?.trustEpoch) };
};
