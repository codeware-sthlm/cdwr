import {
  getComponentDeveloperTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Access, Where } from 'payload';

import { userOnlyAccess } from './user-only-access';

/** The workspace id a new document names, whether a bare id or populated */
const tenantInData = (data: unknown): number | null => {
  if (typeof data !== 'object' || data === null || !('tenant' in data)) {
    return null;
  }
  const { tenant } = data;
  if (typeof tenant === 'number') {
    return tenant;
  }
  return typeof tenant === 'object' &&
    tenant !== null &&
    'id' in tenant &&
    typeof tenant.id === 'number'
    ? tenant.id
    : null;
};

type Operation = 'create' | 'update' | 'delete';

/**
 * Write access for custom components, which run as code on the site.
 *
 * System users and users holding the `componentDeveloper` flag for the
 * document's workspace. Builds on {@link userOnlyAccess}, so the tenant
 * scoping and the refusal of readers and api keys stay in one place.
 *
 * Payload ignores a `Where` result on create, so there the answer is a
 * boolean: the workspace the document is created in must be one the user
 * develops in. Without data (the admin asking whether to offer Create) it is
 * enough to develop somewhere.
 */
export const componentDeveloperAccess =
  (operation: Operation): Access =>
  async (args) => {
    const scoped = await userOnlyAccess()(args);

    if (!scoped || hasRole(args.req.user, 'system-user')) {
      return scoped;
    }

    const developerTenants = getComponentDeveloperTenantIDs(args.req.user);

    if (operation === 'create') {
      if (args.data === undefined || args.data === null) {
        return developerTenants.length > 0;
      }
      const tenant = tenantInData(args.data);
      return tenant !== null && developerTenants.includes(tenant);
    }

    const developer: Where = { tenant: { in: developerTenants } };

    return typeof scoped === 'object'
      ? { and: [scoped, developer] }
      : developer;
  };
