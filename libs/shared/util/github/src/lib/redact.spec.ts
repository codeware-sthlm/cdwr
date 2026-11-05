import * as core from '@actions/core';
import { vi } from 'vitest';

import { maskSecrets, maskSecretsIn, redactConfig } from './redact';

vi.mock('@actions/core', () => ({ setSecret: vi.fn() }));

describe('redactConfig', () => {
  const config = {
    token: 'x',
    infisical: { clientId: 'id', clientSecret: 's' },
    appDetails: { cms: [{ tenant: 'a', secrets: { API_KEY: 'k' } }] },
    secrets: ['A=1']
  };

  it('redacts sensitive values and keeps the rest', () => {
    expect(redactConfig(config)).toEqual({
      token: '[redacted]',
      infisical: { clientId: 'id', clientSecret: '[redacted]' },
      appDetails: {
        cms: [{ tenant: 'a', secrets: { API_KEY: '[redacted]' } }]
      },
      secrets: ['A=[redacted]']
    });
  });

  it('does not mutate the input', () => {
    const copy = structuredClone(config);
    const result = redactConfig(config);

    expect(config).toEqual(copy);
    expect(result).not.toBe(config);
  });

  it('keeps empty strings, booleans, null and numbers under other keys', () => {
    expect(
      redactConfig({ token: '', count: 3, flag: true, none: null })
    ).toEqual({ token: '', count: 3, flag: true, none: null });
  });

  it('redacts a number under a sensitive key', () => {
    expect(redactConfig({ password: 1, secrets: { PIN: 482913 } })).toEqual({
      password: '[redacted]',
      secrets: { PIN: '[redacted]' }
    });
  });

  it('redacts a value holding = whole unless it is a list item', () => {
    expect(
      redactConfig({
        token: 'A=1',
        secrets: { DATABASE_URL: 'postgres://u:pass@h/db?sslmode=require' }
      })
    ).toEqual({ token: '[redacted]', secrets: { DATABASE_URL: '[redacted]' } });
  });
});

describe('maskSecrets', () => {
  beforeEach(() => {
    vi.mocked(core.setSecret).mockClear();
  });

  it('masks each distinct value of 6 or more characters once', () => {
    maskSecrets(['secret-1', 'secret-1', 'secret-2']);

    expect(core.setSecret).toHaveBeenCalledTimes(2);
    expect(core.setSecret).toHaveBeenCalledWith('secret-1');
    expect(core.setSecret).toHaveBeenCalledWith('secret-2');
  });

  it('skips short, blank and missing values', () => {
    maskSecrets(['cms', '     x', undefined, null, '']);

    expect(core.setSecret).not.toHaveBeenCalled();
  });
});

describe('maskSecretsIn', () => {
  beforeEach(() => {
    vi.mocked(core.setSecret).mockClear();
  });

  it('masks the values redactConfig would redact', () => {
    maskSecretsIn({
      token: 'token-value',
      infisical: { clientId: 'client-id-value', clientSecret: 'secret-value' },
      secrets: ['NAME=assigned-value'],
      appDetails: {
        secrets: { DATABASE_URL: 'postgres://u:pass@h/db?sslmode=require' }
      }
    });

    const masked = vi.mocked(core.setSecret).mock.calls.map(([v]) => v);
    expect(masked.sort()).toEqual([
      'assigned-value',
      'postgres://u:pass@h/db?sslmode=require',
      'secret-value',
      'token-value'
    ]);
  });
});
