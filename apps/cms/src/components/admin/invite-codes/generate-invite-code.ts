/**
 * Same shape and alphabet as `generateInviteCode` in
 * `@codeware/shared/util/invite-code`, which needs `node:crypto` and so cannot
 * run in the browser. Crockford base32: no I, L, O or U.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const GROUPS = 4;
const GROUP_LENGTH = 4;

/** A fresh code, `XXXX-XXXX-XXXX-XXXX`, drawn from the browser's CSPRNG */
export const generateInviteCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(GROUPS * GROUP_LENGTH));
  // 32 characters, so the low five bits pick one without bias
  const chars = Array.from(bytes, (byte) => ALPHABET[byte & 31]);

  return Array.from({ length: GROUPS }, (_, i) =>
    chars.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH).join('')
  ).join('-');
};
