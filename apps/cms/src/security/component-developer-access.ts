import {
  getComponentDeveloperTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Access, Where } from 'payload';

import { userOnlyAccess } from './user-only-access';

/**
 * Write access for custom components, which run as code on the site.
 *
 * System users and users holding the `componentDeveloper` flag for the
 * document's workspace. Builds on {@link userOnlyAccess}, so the tenant
 * scoping and the refusal of readers and api keys stay in one place.
 */
export const componentDeveloperAccess = (): Access => async (args) => {
  const scoped = await userOnlyAccess()(args);

  if (!scoped || hasRole(args.req.user, 'system-user')) {
    return scoped;
  }

  const developer: Where = {
    tenant: { in: getComponentDeveloperTenantIDs(args.req.user) }
  };

  return typeof scoped === 'object' ? { and: [scoped, developer] } : developer;
};
