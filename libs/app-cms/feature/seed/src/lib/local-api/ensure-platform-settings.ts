import type { PlatformSetting } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

export type PlatformSettingsData = Pick<
  PlatformSetting,
  'signupOpen' | 'signupNotifyEmail'
>;

/**
 * Ensure the platform-settings singleton exists.
 *
 * `ensureSingleRow` refuses a second document, so this only ever creates the
 * first one, with the signup switch and notice address the definition states.
 * An existing row is left alone: an admin may have closed signup or filled in
 * a custom domain since, and the seed is not the one to undo that.
 *
 * @param payload - Payload instance
 * @param data - What the first row starts with
 * @param options - Seed options
 * @returns The created document or its id if it already exists
 */
export async function ensurePlatformSettings(
  payload: Payload,
  data: PlatformSettingsData,
  options: { transactionID: string | number | undefined }
): Promise<PlatformSetting | number> {
  const { transactionID } = options;
  const { signupNotifyEmail, signupOpen } = data;

  const existing = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  return await payload.create({
    collection: 'platform-settings',
    data: { signupOpen, signupNotifyEmail },
    context: { seedAction: true },
    req: { transactionID }
  });
}
