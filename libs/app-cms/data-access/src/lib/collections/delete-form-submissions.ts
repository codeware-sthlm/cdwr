import type { BasePayload, Where } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/**
 * Delete the form submissions matching a filter.
 *
 * This function respects access control when `authenticatedUser` is present.
 *
 * @param runtime - Payload runtime, or a bare Payload instance for a job
 * @param where - Which submissions to delete
 * @returns The deleted submissions, and any that could not be deleted
 */
export async function deleteFormSubmissions(
  runtime: PayloadRuntime | BasePayload,
  where: Where
) {
  const { payload } = mapToRuntime(runtime);

  return payload.delete({
    collection: 'form-submissions',
    where,
    depth: 0,
    overrideAccess: payload.authenticatedUser === null,
    user: payload.authenticatedUser
  });
}
