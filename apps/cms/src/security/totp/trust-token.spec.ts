/**
 * @jest-environment node
 */
import { SignJWT } from 'jose';

import {
  TRUST_TTL_SECONDS,
  secretHash,
  signTrustToken,
  verifyTrustToken
} from './trust-token';

const secret = 'payload-secret';
const claims = { userId: 5, secretHash: secretHash('BASE32'), trustEpoch: 0 };

const sign = (
  payload: Record<string, unknown>,
  { key = secret, exp = Math.floor(Date.now() / 1000) + 60 } = {}
) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(key));

describe('secretHash', () => {
  it('is 32 hex characters and differs per secret', () => {
    expect(secretHash('A')).toMatch(/^[0-9a-f]{32}$/);
    expect(secretHash('A')).not.toBe(secretHash('B'));
  });
});

describe('trust token', () => {
  it('round-trips its claims', async () => {
    const token = await signTrustToken(claims, secret);
    expect(await verifyTrustToken(token, secret)).toEqual(claims);
  });

  it('expires after 30 days', async () => {
    const token = await signTrustToken(claims, secret);
    const exp = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString()
    ).exp;
    expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(
      TRUST_TTL_SECONDS - 5
    );
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(
      TRUST_TTL_SECONDS
    );
  });

  it.each([
    ['another kind', { ...claims, kind: 'other' }],
    ['no kind', claims],
    ['no secret hash', { kind: 'totp-trust', userId: 5, trustEpoch: 0 }],
    ['no epoch', { kind: 'totp-trust', userId: 5, secretHash: 'x' }],
    ['a string epoch', { kind: 'totp-trust', ...claims, trustEpoch: '0' }],
    ['no user', { kind: 'totp-trust', secretHash: 'x', trustEpoch: 0 }],
    ['the plugin cookie claims', { userId: 5, originalStrategy: 'local-jwt' }],
    ['a Payload auth token', { id: 5, collection: 'users', email: 'a@b.c' }]
  ])('refuses a token with %s', async (_name, payload) => {
    expect(await verifyTrustToken(await sign(payload), secret)).toBeNull();
  });

  it('refuses an expired token', async () => {
    const token = await sign(
      { kind: 'totp-trust', ...claims },
      { exp: Math.floor(Date.now() / 1000) - 10 }
    );
    expect(await verifyTrustToken(token, secret)).toBeNull();
  });

  it('refuses a bad signature and garbage', async () => {
    const token = await signTrustToken(claims, 'other-secret');
    expect(await verifyTrustToken(token, secret)).toBeNull();
    expect(await verifyTrustToken('not.a.jwt', secret)).toBeNull();
  });

  it('carries no claim the plugin cookie needs, so the plugin refuses it', async () => {
    const token = await signTrustToken(claims, secret);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString()
    );
    expect(payload).not.toHaveProperty('originalStrategy');
  });
});
