import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { canEdit, canEditIn } from '@codeware/app-cms/util/misc';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from './resolve-scoped-tenant';

/**
 * May this request edit the workspace it is being served for?
 *
 * The guard for custom endpoints, which act on the deployed tenant's data and
 * often with `overrideAccess`. `canEdit` on its own is workspace-agnostic:
 * someone who edits workspace B but only *reads* workspace A would pass it and
 * then operate on A — exporting its personal data, reordering its signups, or
 * anonymising them.
 *
 * In host mode there is no single workspace in play, so editing anywhere is
 * the most this can ask; the collection's own access control scopes the rest.
 *
 * @param req - The Payload request
 * @returns True when the identity may edit the active workspace
 */
export async function mayEditActiveTenant(
  req: PayloadRequest
): Promise<boolean> {
  const { user, payload } = req;

  if (!canEdit(user)) {
    return false;
  }

  const { APP_MODE } = getEnv();

  if (APP_MODE.type !== 'tenant') {
    return true;
  }

  const tenant = await resolveScopedTenant(payload);

  if (!tenant) {
    payload.logger.warn(
      '[mayEditActiveTenant] Could not resolve tenant in tenant mode, denying access'
    );
    return false;
  }

  return canEditIn(user, tenant.id);
}
