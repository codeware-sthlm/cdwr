import { customT } from '@codeware/app-cms/util/i18n';
import { getId, hasRole } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import { type CollectionBeforeValidateHook, ValidationError } from 'payload';

const tenantIds = (tenants: User['tenants']) =>
  (tenants ?? []).map((row) => getId(row.tenant));

const sameTenants = (a: User['tenants'], b: User['tenants']) => {
  const left = tenantIds(a);
  const right = tenantIds(b);
  return left.length === right.length && left.every((id, i) => id === right[i]);
};

/**
 * Ensures that a collection user belongs to a workspace,
 * unless the logged in user is a system user.
 */
export const ensureTenantHook: CollectionBeforeValidateHook<User> = ({
  collection,
  context,
  data,
  operation,
  originalDoc,
  req: { t, user }
}) => {
  // A system user has no workspaces by design, whoever saves it; payload-totp
  // saves the secret with no request, so there is no logged in user to check
  if (data?.role === 'system-user') {
    return data;
  }

  // Payload fills fields an update leaves out from the stored document before
  // this hook runs, so an update that leaves the workspaces alone shows here
  // as the stored ones, not as a missing field
  if (
    operation === 'update' &&
    originalDoc &&
    sameTenants(data?.tenants, originalDoc.tenants)
  ) {
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
