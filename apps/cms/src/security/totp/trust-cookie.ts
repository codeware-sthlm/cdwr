import { cookies } from 'next/headers';
import type { Payload, SanitizedCollectionConfig } from 'payload';

import { TRUST_TTL_SECONDS } from './trust-token';

export const trustCookieName = (cookiePrefix: string | undefined): string =>
  `${cookiePrefix ?? 'payload'}-totp-trust`;

/**
 * The value of `name` in a `Cookie` request header. The last one wins, as in
 * Payload's own parsing; a value that does not decode is skipped.
 * (`parseCookies` from `payload` cannot be imported under jest.)
 */
export const readCookie = (
  headers: Headers,
  name: string
): string | undefined => {
  let value: string | undefined;
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        value = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        // keep an earlier value
      }
    }
  }
  return value;
};

const sameSiteValues = { Lax: 'lax', None: 'none', Strict: 'strict' } as const;

const toSameSite = (
  value: keyof typeof sameSiteValues | boolean | undefined
): 'lax' | 'none' | 'strict' | undefined =>
  typeof value === 'string'
    ? sameSiteValues[value]
    : value
      ? 'strict'
      : undefined;

type CookieArgs = {
  payload: Pick<Payload, 'config'>;
  collectionAuth: Pick<SanitizedCollectionConfig['auth'], 'cookies'>;
};

/** Flags follow the collection's session cookie, as the plugin's own cookie */
const cookieAttributes = ({ payload, collectionAuth }: CookieArgs) => {
  const { cookies: flags } = collectionAuth;
  return {
    name: trustCookieName(payload.config.cookiePrefix),
    domain: flags.domain ?? undefined,
    httpOnly: true,
    path: '/',
    sameSite: toSameSite(flags.sameSite),
    secure: flags.secure
  } as const;
};

export const setTrustCookie = async ({
  token,
  ...args
}: CookieArgs & { token: string }): Promise<void> => {
  const { name, ...attributes } = cookieAttributes(args);
  const cookieStore = await cookies();
  cookieStore.set(name, token, {
    ...attributes,
    expires: new Date(Date.now() + TRUST_TTL_SECONDS * 1000)
  });
};

/** A `Set-Cookie` value that removes the trust cookie, with the flags it was set with */
export const expiredTrustCookie = (args: CookieArgs): string => {
  const { name, domain, sameSite, secure } = cookieAttributes(args);
  return [
    `${name}=`,
    'Path=/',
    ...(domain ? [`Domain=${domain}`] : []),
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    ...(sameSite
      ? [`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`]
      : [])
  ].join('; ');
};
