import type { FaqDefinition } from '@codeware/shared/util/seed';
import { platform } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { ensureFaq } from './local-api/ensure-faq';
import { withSeedLock } from './seed-lock';

/**
 * Applies the platform FAQ at host boot, in every environment.
 *
 * The seed refuses production, but the help drawer's entries are platform
 * content rather than seed data, so they get a path of their own: create or
 * update each entry from `faq.ts`, matched on its English question, and
 * never delete. An entry edited through the admin is overwritten here.
 *
 * Under the seed lock, since machines booting together would race on
 * check-then-insert, and in one transaction. It logs and never throws: a
 * FAQ that fails to apply must not stop the admin from booting.
 *
 * @param payload - Payload instance
 * @param entries - The entries to apply, the platform's own by default
 */
export async function applyPlatformFaq(
  payload: Payload,
  entries: ReadonlyArray<FaqDefinition> = platform.faq
): Promise<void> {
  try {
    const actions = await withSeedLock(payload, async () => {
      const transactionID = await payload.db.beginTransaction();
      if (transactionID === null || transactionID === undefined) {
        throw new Error('The database adapter started no transaction');
      }

      try {
        const results = [];
        for (const entry of entries) {
          results.push(await ensureFaq(payload, entry, { transactionID }));
        }
        await payload.db.commitTransaction(transactionID);
        return results.map(({ action }) => action);
      } catch (error) {
        await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
    });

    const count = (action: (typeof actions)[number]) =>
      actions.filter((a) => a === action).length;
    payload.logger.info(
      `[FAQ] Platform FAQ applied: ${count('created')} created, ${count('updated')} updated, ${count('existed')} unchanged`
    );
  } catch (error) {
    payload.logger.error(
      `[FAQ] Could not apply the platform FAQ, the help drawer keeps what it had: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
