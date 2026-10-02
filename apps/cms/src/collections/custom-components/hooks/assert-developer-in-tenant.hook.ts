import {
  getComponentDeveloperTenantIDs,
  getId,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import { APIError, type CollectionBeforeChangeHook } from 'payload';

/**
 * A component may only be created in, or moved to, a workspace the user
 * develops in.
 *
 * Create access cannot answer this: Payload ignores a query constraint there
 * and the workspace is settled by the tenant field after access has run. So
 * the final data is checked here, where the workspace is known.
 */
export const assertDeveloperInTenant: CollectionBeforeChangeHook<
  CustomComponent
> = ({ context, data, operation, originalDoc, req: { user } }) => {
  if (hasRole(user, 'system-user') || context['seedAction']) {
    return data;
  }

  const tenant = data.tenant === undefined ? undefined : getId(data.tenant);
  const unchanged =
    operation === 'update' &&
    (tenant === undefined || tenant === getId(originalDoc?.tenant));
  if (unchanged) {
    return data;
  }

  if (!tenant || !getComponentDeveloperTenantIDs(user).includes(tenant)) {
    throw new APIError(
      'Custom components may only be created in a workspace you develop in.',
      403
    );
  }

  return data;
};
