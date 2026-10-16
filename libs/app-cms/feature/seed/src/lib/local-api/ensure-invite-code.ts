import { parseInviteCode } from '@codeware/shared/util/invite-code';
import type { InviteCode } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

export type InviteCodeData = {
  /** The plain code, `XXXX-XXXX-XXXX-XXXX` */
  code: string;
  note: string;
  maxUses: number;
  expiresAt?: string;
};

/**
 * Ensure an invite code exists, found by the public half of the code.
 *
 * The plain code only reaches the collection's hook, which stores the lookup
 * and a hash of the secret half. An existing code is left as it is, uses and
 * all, so a re-seed never hands back a spent use.
 *
 * @param payload - Payload instance
 * @param data - The code and what the admin list shows about it
 * @param options - Seed options
 * @returns The created document or its id if it already exists
 * @throws If the code is not one the collection would take
 */
export async function ensureInviteCode(
  payload: Payload,
  data: InviteCodeData,
  options: { transactionID: string | number | undefined }
): Promise<InviteCode | number> {
  const { transactionID } = options;
  const { code, expiresAt, maxUses, note } = data;

  const parts = parseInviteCode(code);
  if (!parts) {
    throw new Error(`'${code}' is not an invite code`);
  }

  const existing = await payload.find({
    collection: 'invite-codes',
    where: { lookup: { equals: parts.lookup } },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  return await payload.create({
    collection: 'invite-codes',
    data: {
      code,
      // Both stored halves come from the hook; the type wants the column stated
      codeHash: '',
      expiresAt,
      maxUses,
      note
    },
    req: { transactionID }
  });
}
