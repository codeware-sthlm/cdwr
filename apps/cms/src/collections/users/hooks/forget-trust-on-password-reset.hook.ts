import { nextTrustEpoch } from '@codeware/app-cms/data-access';
import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeValidateHook } from 'payload';

/**
 * A password reset forgets every trusted device of the user, as
 * **Forget all trusted devices** does: a fresh random trust epoch.
 *
 * A reset writes straight to the database and runs no `beforeChange`. Its one
 * collection hook is `beforeValidate`, called with the raw user row, already
 * holding the new `hash`, and no `originalDoc`; that row is then written as
 * is, in the same transaction. A regular update always passes `originalDoc`,
 * so the two can't be mistaken, and setting the epoch on the row makes it part
 * of the reset's own write.
 */
export const forgetTrustOnPasswordResetHook: CollectionBeforeValidateHook<
  User
> = ({ data, operation, originalDoc }) => {
  const row = data as (Partial<User> & { hash?: unknown }) | undefined;

  if (operation !== 'update' || originalDoc || typeof row?.hash !== 'string') {
    return data;
  }

  // Payload ignores the return value here, so the row itself must change
  row.trustEpoch = nextTrustEpoch(row.trustEpoch);
  return data;
};
