import { describe, expect, it } from 'vitest';

import { type AdoptableDomain, adoptableDomains } from './adoptable-domains';

const domain = (overrides: Partial<AdoptableDomain> = {}): AdoptableDomain => ({
  hostname: 'tours.example.com',
  app: 'cdwr-web-moon',
  certificate: { isConfigured: true },
  ...overrides
});

const app = 'cdwr-web-moon';

describe('adoptableDomains', () => {
  it('adopts a validated primary domain', () => {
    expect(adoptableDomains([domain({ isPrimary: true })], app)).toEqual({
      primary: 'https://tours.example.com',
      origins: ['https://tours.example.com']
    });
  });

  it('answers on a domain without making it the app identity', () => {
    // Adding a second domain must not silently move the app's own url
    expect(adoptableDomains([domain()], app)).toEqual({
      primary: null,
      origins: ['https://tours.example.com']
    });
  });

  it('ignores a domain whose certificate has not been issued', () => {
    // Adopting it early would put every generated link on a hostname that
    // fails TLS — including the password reset that gets you back in
    expect(
      adoptableDomains(
        [domain({ isPrimary: true, certificate: { isConfigured: false } })],
        app
      )
    ).toEqual({ primary: null, origins: [] });
  });

  it('ignores a domain that was never checked', () => {
    expect(
      adoptableDomains([domain({ isPrimary: true, certificate: null })], app)
    ).toEqual({ primary: null, origins: [] });
  });

  it('ignores another app domain in the same workspace', () => {
    // The cms would otherwise advertise the web client's url
    expect(
      adoptableDomains([domain({ app: 'cdwr-cms-moon', isPrimary: true })], app)
    ).toEqual({ primary: null, origins: [] });
  });

  it('puts the primary first however the rows are ordered', () => {
    const result = adoptableDomains(
      [
        domain({ hostname: 'old.example.com' }),
        domain({ hostname: 'new.example.com', isPrimary: true })
      ],
      app
    );

    expect(result.primary).toBe('https://new.example.com');
    expect(result.origins).toEqual([
      'https://new.example.com',
      'https://old.example.com'
    ]);
  });

  it('keeps answering on a domain people were moved off', () => {
    const result = adoptableDomains(
      [
        domain({ hostname: 'new.example.com', isPrimary: true }),
        domain({ hostname: 'old.example.com' })
      ],
      app
    );

    expect(result.origins).toContain('https://old.example.com');
  });

  it('adopts nothing when the deployment has no app name', () => {
    // Rather than matching every row and adopting a stranger's domain
    expect(adoptableDomains([domain({ isPrimary: true })], undefined)).toEqual({
      primary: null,
      origins: []
    });
  });

  it('adopts nothing from a workspace with no domains', () => {
    expect(adoptableDomains(null, app)).toEqual({ primary: null, origins: [] });
    expect(adoptableDomains([], app)).toEqual({ primary: null, origins: [] });
  });
});
