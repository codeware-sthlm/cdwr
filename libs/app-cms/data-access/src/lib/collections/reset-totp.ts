import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/**
 * Reset a user's two-factor login: clear their TOTP secret and end every
 * session they have, in one update.
 *
 * Always overrides access, since `payload-totp` makes the secret writable by
 * nobody. The caller decides who may reset whom (`canResetTotp`). No request
 * is passed, as `payload-totp` does when it saves the secret, so the users
 * hooks see a partial save by the system.
 *
 * Emptying `sessions` ends the user's JWT sessions, and with them the
 * `payload-totp` cookie that wraps them; the next sign-in asks for enrolment.
 *
 * @param runtime - Payload runtime, or a bare Payload instance
 * @param options.id - ID of the user to reset
 */
export async function resetTotp(
  runtime: PayloadRuntime | BasePayload,
  { id }: { id: number }
): Promise<void> {
  const { payload } = mapToRuntime(runtime);

  await payload.update({
    collection: 'users',
    id,
    data: { totpSecret: null, sessions: [] },
    depth: 0,
    overrideAccess: true
  });
}
