import {
  getComponentDeveloperTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Access, Where } from 'payload';

import { userOnlyAccess } from './user-only-access';

type Operation = 'create' | 'update' | 'delete';

/**
 * Write access for custom components, which run as code on the site.
 *
 * System users and users holding the `componentDeveloper` flag for the
 * document's workspace. Builds on {@link userOnlyAccess}, so the tenant
 * scoping and the refusal of readers and api keys stay in one place.
 *
 * Payload ignores a `Where` result on create, and asks for create access
 * with empty data when it draws the admin's Create button, so there the answer
 * is whether the user develops anywhere. Which workspace a new document may
 * land in is checked by the collection's `assertDeveloperInTenant` hook on the
 * final data.
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
      return developerTenants.length > 0;
    }

    const developer: Where = { tenant: { in: developerTenants } };

    return typeof scoped === 'object'
      ? { and: [scoped, developer] }
      : developer;
  };
