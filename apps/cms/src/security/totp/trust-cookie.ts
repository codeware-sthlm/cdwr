import { cookies } from 'next/headers';
import type { Payload, SanitizedCollectionConfig } from 'payload';

import { TRUST_TTL_SECONDS } from './trust-token';

export const trustCookieName = (cookiePrefix: string | undefined): string =>
  `${cookiePrefix ?? 'payload'}-totp-trust`;

/** The value of `name` in a `Cookie` request header */
export const readCookie = (
  headers: Headers,
  name: string
): string | undefined => {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
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

/** Flags follow the collection's session cookie, as the plugin's own cookie */
export const setTrustCookie = async ({
  payload,
  collectionAuth,
  token
}: {
  payload: Pick<Payload, 'config'>;
  collectionAuth: Pick<SanitizedCollectionConfig['auth'], 'cookies'>;
  token: string;
}): Promise<void> => {
  const { cookies: flags } = collectionAuth;
  const cookieStore = await cookies();
  cookieStore.set(trustCookieName(payload.config.cookiePrefix), token, {
    domain: flags.domain ?? undefined,
    expires: new Date(Date.now() + TRUST_TTL_SECONDS * 1000),
    httpOnly: true,
    path: '/',
    sameSite: toSameSite(flags.sameSite),
    secure: flags.secure
  });
};
