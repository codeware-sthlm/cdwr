import type { SiteSetting } from '@codeware/shared/util/payload-types';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/**
 * Fetch the full site settings document of every tenant the caller may read.
 *
 * Unscoped by design, for platform jobs that work through every workspace in
 * turn, such as retention sweeps. A runtime without an authenticated user
 * reads them all; with one, access control narrows the result.
 *
 * Kept at depth 0.
 *
 * @param runtime - Payload runtime, or a bare Payload instance for a job
 * @returns Every readable site settings document
 */
export async function getSiteSettingsForAllTenants(
  runtime: PayloadRuntime | BasePayload
): Promise<Array<SiteSetting>> {
  const { payload } = mapToRuntime(runtime);

  const { docs } = await payload.find({
    collection: 'site-settings',
    depth: 0,
    pagination: false,
    overrideAccess: payload.authenticatedUser === null,
    user: payload.authenticatedUser
  });

  return docs;
}
