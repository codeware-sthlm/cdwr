import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/**
 * End every trusted device of a user: raise their trust epoch by one, so each
 * trust token issued before no longer matches. A missing epoch counts as 0.
 *
 * Always overrides access, since the epoch is writable by nobody. The caller
 * decides who may forget whose devices. No request is passed, as in
 * `resetTotp`, so the users hooks see a partial save by the system.
 *
 * @param runtime - Payload runtime, or a bare Payload instance
 * @param options.id - ID of the user whose devices are forgotten
 * @returns The new epoch
 */
export async function forgetTotpTrust(
  runtime: PayloadRuntime | BasePayload,
  { id }: { id: number }
): Promise<number> {
  const { payload } = mapToRuntime(runtime);

  const user = await payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
    select: { trustEpoch: true }
  });
  const next = (user.trustEpoch ?? 0) + 1;

  await payload.update({
    collection: 'users',
    id,
    data: { trustEpoch: next },
    depth: 0,
    overrideAccess: true
  });
  return next;
}
