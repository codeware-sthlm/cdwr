import { describe, expect, it } from 'vitest';

import {
  createSiteGateToken,
  matchesSiteGatePassword,
  verifySiteGateToken
} from './site-gate-token';

const password = 'open sesame';
const now = Date.UTC(2026, 8, 17);

describe('site gate token', () => {
  it('accepts a token it minted itself', () => {
    const token = createSiteGateToken(password, { now });

    expect(verifySiteGateToken(token, password, { now })).toBe(true);
  });

  it('refuses a token whose signature was tampered with', () => {
    const token = createSiteGateToken(password, { now });
    const [payload, signature] = token.split('.');
    const flipped = `${payload}.${signature.slice(0, -2)}xy`;

    expect(verifySiteGateToken(flipped, password, { now })).toBe(false);
  });

  it('refuses a stay extended by rewriting the expiry', () => {
    const token = createSiteGateToken(password, { now });
    const signature = token.split('.')[1];
    const later = Math.floor(now / 1000) + 60 * 60 * 24 * 365;

    expect(
      verifySiteGateToken(`${later}.${signature}`, password, { now })
    ).toBe(false);
  });

  it('refuses a token that has expired', () => {
    const token = createSiteGateToken(password, { maxAgeSeconds: 60, now });

    expect(verifySiteGateToken(token, password, { now: now + 61_000 })).toBe(
      false
    );
  });

  it('refuses every token once the password is rotated', () => {
    const token = createSiteGateToken(password, { now });

    expect(verifySiteGateToken(token, 'a new password', { now })).toBe(false);
  });

  it('refuses a missing or malformed cookie', () => {
    expect(verifySiteGateToken(undefined, password, { now })).toBe(false);
    expect(verifySiteGateToken('', password, { now })).toBe(false);
    expect(verifySiteGateToken('not-a-token', password, { now })).toBe(false);
    expect(verifySiteGateToken('.signature', password, { now })).toBe(false);
  });

  it('refuses anything at all when no password is configured', async () => {
    // An empty password must never read as "open", only as "nothing matches"
    const token = createSiteGateToken(password, { now });

    expect(verifySiteGateToken(token, '', { now })).toBe(false);
    expect(await matchesSiteGatePassword('', '')).toBe(false);
  });
});

describe('matchesSiteGatePassword', () => {
  it('accepts the configured password and refuses anything else', async () => {
    expect(await matchesSiteGatePassword(password, password)).toBe(true);
    expect(await matchesSiteGatePassword('Open Sesame', password)).toBe(false);
    expect(await matchesSiteGatePassword('open sesame ', password)).toBe(false);
    expect(await matchesSiteGatePassword(undefined, password)).toBe(false);
  });
});
