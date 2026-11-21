import { describe, expect, it } from 'vitest';

import { resolveTurnstilePair } from './resolve-turnstile-pair';

const pair = (prefix: string) => ({
  TURNSTILE_SITE_KEY: `${prefix}-site`,
  TURNSTILE_SECRET_KEY: `${prefix}-secret`
});

describe('resolveTurnstilePair', () => {
  it('takes the tenant pair over the shared one', () => {
    expect(
      resolveTurnstilePair([
        { source: '/tenants/moon/apps/cms', keys: {} },
        { source: '/tenants/moon', keys: pair('tenant') },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ source: '/tenants/moon', ...pair('tenant') });
  });

  it("takes the tenant's app folder over the tenant folder", () => {
    expect(
      resolveTurnstilePair([
        { source: '/tenants/moon/apps/cms', keys: pair('app') },
        { source: '/tenants/moon', keys: pair('tenant') },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ source: '/tenants/moon/apps/cms', ...pair('app') });
  });

  it('falls back to the shared pair when no tenant folder sets a key', () => {
    expect(
      resolveTurnstilePair([
        { source: '/tenants/moon', keys: {} },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ source: '/apps/cms', ...pair('shared') });
  });

  it('never mixes a half tenant pair with the shared half', () => {
    expect(
      resolveTurnstilePair([
        {
          source: '/tenants/moon',
          keys: { TURNSTILE_SITE_KEY: 'tenant-site' }
        },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ source: '/tenants/moon', TURNSTILE_SITE_KEY: 'tenant-site' });

    expect(
      resolveTurnstilePair([
        {
          source: '/tenants/moon',
          keys: { TURNSTILE_SECRET_KEY: 'tenant-secret' }
        },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({
      source: '/tenants/moon',
      TURNSTILE_SECRET_KEY: 'tenant-secret'
    });
  });

  it('treats an empty value as not set', () => {
    expect(
      resolveTurnstilePair([
        {
          source: '/tenants/moon',
          keys: { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '' }
        },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ source: '/apps/cms', ...pair('shared') });
  });

  it('leaves no pair when a higher folder could not be read', () => {
    expect(
      resolveTurnstilePair([
        { source: '/tenants/moon', keys: null },
        { source: '/apps/cms', keys: pair('shared') }
      ])
    ).toEqual({ unreadable: '/tenants/moon' });
  });

  it('returns no source when nothing sets a key', () => {
    expect(
      resolveTurnstilePair([
        { source: '/tenants/moon', keys: {} },
        { source: '/apps/cms', keys: {} }
      ])
    ).toEqual({});
  });
});
