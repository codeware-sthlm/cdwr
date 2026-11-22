import { createHash } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

export const TRUST_TTL_SECONDS = 30 * 24 * 60 * 60;

const TRUST_KIND = 'totp-trust';

const trustClaimsSchema = z.object({
  kind: z.literal(TRUST_KIND),
  userId: z.number(),
  secretHash: z.string(),
  trustEpoch: z.number()
});

export type TrustClaims = Omit<z.infer<typeof trustClaimsSchema>, 'kind'>;

/** Ties a token to the secret it was issued for without carrying the secret */
export const secretHash = (totpSecret: string): string =>
  createHash('sha256').update(totpSecret).digest('hex').slice(0, 32);

/** Signed with the Payload secret; `kind` keeps it apart from every other token */
export const signTrustToken = async (
  claims: TrustClaims,
  secret: string
): Promise<string> =>
  new SignJWT({ kind: TRUST_KIND, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + TRUST_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));

/** The claims of a valid, unexpired trust token, otherwise null */
export const verifyTrustToken = async (
  token: string,
  secret: string
): Promise<TrustClaims | null> => {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ['HS256'] }
    );
    const parsed = trustClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    const { userId, secretHash, trustEpoch } = parsed.data;
    return { userId, secretHash, trustEpoch };
  } catch {
    return null;
  }
};
