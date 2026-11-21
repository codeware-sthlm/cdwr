import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** Crockford base32: no I, L, O or U, so a code survives being read aloud */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const GROUPS = 4;
const GROUP_LENGTH = 4;
const LENGTH = GROUPS * GROUP_LENGTH;
/** The first half is a public lookup; the second half is the secret */
const LOOKUP_LENGTH = LENGTH / 2;

const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** Key derivation, deliberately slow, as for the site gate password */
const derive = promisify(scrypt) as (
  secret: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/** A code split into the part stored in plain and the part only its hash knows */
export interface InviteCodeParts {
  lookup: string;
  secret: string;
}

/** `XXXX-XXXX-XXXX-XXXX` from a normalised code */
const format = (code: string): string =>
  Array.from({ length: GROUPS }, (_, i) =>
    code.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH)
  ).join('-');

/** A fresh code, `XXXX-XXXX-XXXX-XXXX`, every character drawn without bias */
export const generateInviteCode = (): string =>
  format(
    Array.from(
      { length: LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)]
    ).join('')
  );

/**
 * A typed code as stored: uppercase, without spaces or dashes, with the
 * letters people confuse mapped to the digits they meant (`O`→`0`, `I`/`L`→`1`).
 *
 * @returns The parts, or `null` when it cannot be a code at all
 */
export const parseInviteCode = (
  input: string | null | undefined
): InviteCodeParts | null => {
  if (!input) {
    return null;
  }
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== LENGTH || [...code].some((c) => !ALPHABET.includes(c))) {
    return null;
  }
  return {
    lookup: code.slice(0, LOOKUP_LENGTH),
    secret: code.slice(LOOKUP_LENGTH)
  };
};

/** `scrypt$<salt>$<hash>`, a fresh salt per code */
export const hashInviteSecret = async (secret: string): Promise<string> => {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(secret, salt, KEY_BYTES);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
};

/** Stands in for a missing hash, so an unknown lookup costs the same as a known one */
const DUMMY_SALT = Buffer.alloc(SALT_BYTES);

/**
 * Whether a secret matches its stored hash.
 *
 * Takes as long for a missing or malformed hash as for a real one, so the
 * timing does not tell a caller whether the lookup half exists.
 *
 * @param secret - The second half of a parsed code
 * @param stored - `scrypt$<salt>$<hash>`, or nothing when the lookup matched no code
 */
export const verifyInviteSecret = async (
  secret: string,
  stored: string | null | undefined
): Promise<boolean> => {
  const [scheme, salt, hash] = stored?.split('$') ?? [];
  const expected = hash ? Buffer.from(hash, 'base64url') : null;
  const valid =
    scheme === 'scrypt' &&
    salt !== undefined &&
    expected !== null &&
    expected.length === KEY_BYTES;

  const derived = await derive(
    secret,
    valid ? Buffer.from(salt, 'base64url') : DUMMY_SALT,
    KEY_BYTES
  );
  return valid && timingSafeEqual(derived, expected);
};
