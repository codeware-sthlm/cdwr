import type { Payload } from 'payload';
import { z } from 'zod';

const trustStateSchema = z.object({
  totpSecret: z.string().min(1),
  trustEpoch: z.coerce
    .number()
    .nullish()
    .transform((epoch) => epoch ?? 0)
});

export type TrustState = z.infer<typeof trustStateSchema>;

/**
 * The secret and trust epoch of a user. Both are hidden from the API,
 * so they are read with hidden fields shown, as the plugin does. A missing epoch is 0. Null when the user has no
 * secret.
 */
export const readTrustState = async (
  payload: Payload,
  userId: number | string
): Promise<TrustState | null> => {
  try {
    const doc = await payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      select: { totpSecret: true, trustEpoch: true }
    });
    const parsed = trustStateSchema.safeParse(doc);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
