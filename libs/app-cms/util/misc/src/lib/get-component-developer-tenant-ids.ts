import type { Tenant, UserAny } from '@codeware/shared/util/payload-types';

import { editorTenantRoles } from './can-edit';
import { getId } from './get-id';
import { isUser } from './is-user';

/**
 * Get the tenant IDs the user may author custom components in.
 *
 * Needs the `componentDeveloper` flag on the membership row and an editor role
 * on top of it, so a `reader` never qualifies. System users are not covered
 * here: they hold no membership and are granted everything by role.
 *
 * @param user - The user to get the tenant IDs for.
 * @returns The tenant IDs the user may author components in.
 */
export const getComponentDeveloperTenantIDs = (
  user: UserAny | null
): Array<Tenant['id']> => {
  if (!isUser(user)) {
    return [];
  }

  return (user.tenants ?? []).flatMap(({ tenant, role, componentDeveloper }) =>
    tenant && componentDeveloper && editorTenantRoles.includes(role)
      ? [getId(tenant)]
      : []
  );
};
