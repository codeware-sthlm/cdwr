import { randomInt } from 'node:crypto';

import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/** Largest epoch drawn, kept within a 32-bit integer */
const EPOCH_MAX = 2 ** 31 - 1;

/**
 * Draw a random trust epoch other than the current one. Never 0, the
 * default, so a user who never had an epoch also ends up with a new one.
 *
 * @param current - The user's epoch now, if known
 * @returns A positive epoch other than `current`
 */
export function nextTrustEpoch(current?: number | null): number {
  let next = randomInt(1, EPOCH_MAX);
  while (next === current) {
    next = randomInt(1, EPOCH_MAX);
  }
  return next;
}

/**
 * End every trusted device of a user: give them a fresh random trust epoch,
 * so each trust token issued before no longer matches. Random rather than
 * plus one, so two forgets at once still end on a value no earlier token
 * carries, without an atomic increment.
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
  const next = nextTrustEpoch(user.trustEpoch);

  await payload.update({
    collection: 'users',
    id,
    data: { trustEpoch: next },
    depth: 0,
    overrideAccess: true
  });
  return next;
}
