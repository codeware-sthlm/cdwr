import { z } from 'zod';

import type { ClientSecret } from '../../services/infisical-identity';

/** The agent-host keys that hold each Infisical identity's universal-auth credentials */
export const INFISICAL_ROTATIONS = {
  platform: {
    clientId: 'PLATFORM_INFISICAL_CLIENT_ID',
    clientSecret: 'PLATFORM_INFISICAL_CLIENT_SECRET'
  },
  desk: {
    clientId: 'DESK_INFISICAL_CLIENT_ID',
    clientSecret: 'DESK_INFISICAL_CLIENT_SECRET'
  }
} as const satisfies Record<string, { clientId: string; clientSecret: string }>;

export type IdentityTarget = keyof typeof INFISICAL_ROTATIONS;
export type SecretKey =
  (typeof INFISICAL_ROTATIONS)[IdentityTarget]['clientSecret'];

export const IDENTITY_TARGETS = Object.keys(INFISICAL_ROTATIONS).filter(
  (target): target is IdentityTarget => target in INFISICAL_ROTATIONS
);

/** The description a rotated client secret is created with, so a later run can find it */
export const descriptionOf = (key: SecretKey): string => `cdwr: ${key}`;

export interface Claims {
  identityId: string;
  clientSecretId: string;
}

const claimsSchema = z.object({
  identityId: z.string().min(1),
  clientSecretId: z.string().min(1)
});

/** The identity and client secret an access token was issued for; the error never holds the token */
export function claimsOf(accessToken: string): Claims {
  const fail = () =>
    new Error('The access token is not a universal-auth token');
  const [, body, ...rest] = accessToken.split('.');
  if (body === undefined || rest.length !== 1) throw fail();
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw fail();
  }
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) throw fail();
  return parsed.data;
}

/**
 * The live secrets to revoke: the old one, and any an earlier run left under
 * the key's description. Other live secrets are returned and left alone.
 * Never the one to keep.
 */
export function toRevoke(
  secrets: ClientSecret[],
  opts: { keep: string; old?: string; key: SecretKey }
): { revoke: ClientSecret[]; others: ClientSecret[] } {
  const live = secrets.filter(
    (secret) => !secret.isClientSecretRevoked && secret.id !== opts.keep
  );
  const isOurs = (secret: ClientSecret) =>
    secret.id === opts.old || secret.description === descriptionOf(opts.key);
  return {
    revoke: live.filter(isOurs),
    others: live.filter((secret) => !isOurs(secret))
  };
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/** One line to recognise a secret by: prefix, description, creation and expiry */
export function describeSecret(secret: ClientSecret): string {
  const created = new Date(secret.createdAt);
  const expires =
    secret.clientSecretTTL === 0
      ? 'never expires'
      : `expires ${day(new Date(created.getTime() + secret.clientSecretTTL * 1000))}`;
  return `${secret.clientSecretPrefix}… "${secret.description}", created ${day(created)}, ${expires}`;
}
