import { customT } from '@codeware/app-cms/util/i18n';
import {
  hashInviteSecret,
  parseInviteCode
} from '@codeware/shared/util/invite-code';
import type { InviteCode } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeChangeHook } from 'payload';
import { ValidationError } from 'payload';

/**
 * Keep the plain code out of the database and the stored parts fixed.
 *
 * On create, the virtual `code` is split into the public `lookup` and the
 * hash of the secret half, and dropped. After that nothing derived from it can
 * change, and `uses` is only moved by the signup itself.
 */
export const protectInviteCode: CollectionBeforeChangeHook<
  InviteCode
> = async ({ data, operation, originalDoc, req: { t } }) => {
  const fail = (path: string, message: string): never => {
    throw new ValidationError({
      collection: 'invite-codes',
      errors: [{ message, path }]
    });
  };

  if (operation === 'create') {
    const parts = parseInviteCode(data.code);

    if (!parts) {
      return fail('code', customT(t)('validation:inviteCodeInvalid'));
    }

    data.lookup = parts.lookup;
    data.codeHash = await hashInviteSecret(parts.secret);
    delete data.code;

    return data;
  }

  const changed =
    (data.lookup !== undefined && data.lookup !== originalDoc?.lookup) ||
    data.codeHash !== undefined ||
    Boolean(data.code);

  if (changed) {
    return fail('code', customT(t)('validation:inviteCodeImmutable'));
  }

  delete data.code;

  // The admin form submits the counter it loaded. Writing it back could undo a
  // use spent meanwhile, so an update never touches the column at all
  delete data.uses;

  return data;
};
