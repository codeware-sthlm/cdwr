import { customT } from '@codeware/app-cms/util/i18n';
import { hasRole } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import { type CollectionBeforeValidateHook, ValidationError } from 'payload';

/**
 * Ensures that a collection user belongs to a workspace,
 * unless the logged in user is a system user.
 */
export const ensureTenantHook: CollectionBeforeValidateHook<User> = ({
  collection,
  context,
  data,
  operation,
  req: { t, user }
}) => {
  // An update that leaves the workspaces alone, such as payload-totp saving a
  // secret with no request, keeps the ones the user already has
  if (operation === 'update' && data?.tenants === undefined) {
    return data;
  }

  // Providing a tenant is not required for system users, seeding, signup or the idle workspace cleanup
  if (
    hasRole(user, 'system-user') ||
    context?.seedAction ||
    context?.signup ||
    context?.statsAccountWrite ||
    context?.idleCleanup
  ) {
    return data;
  }

  if (data?.tenants?.length) {
    return data;
  }

  throw new ValidationError({
    collection: collection.slug,
    id: data?.id,
    errors: [
      {
        message: customT(t)('validation:mustBelongToWorkspace'),
        path: 'tenants'
      }
    ]
  });
};
