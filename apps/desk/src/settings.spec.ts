import { describe, expect, it } from 'vitest';

import {
  type KeyValueStore,
  type Settings,
  loadSettings,
  saveSettings,
  validateSettings
} from './settings';

const REF = 'abcdefghij0123456789';
const JWT = 'eyJhbGciOi.eyJyb2xlIjoi.c2lnbmF0dXJl';

const valid: Settings = {
  linearKey: 'lin_api_abc123',
  supabaseUrl: `https://${REF}.supabase.co`,
  supabaseAnonKey: JWT
};

const fields = (input: Settings) => {
  const check = validateSettings(input);
  return check.ok ? [] : check.issues.map((i) => i.field);
};

const memoryStore = (initial: Record<string, unknown> = {}) => {
  const values = new Map(Object.entries(initial));
  let saves = 0;
  const store: KeyValueStore = {
    get: (key) => Promise.resolve(values.get(key)),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    save: () => {
      saves += 1;
      return Promise.resolve();
    }
  };
  return { store, values, saves: () => saves };
};

describe('validateSettings', () => {
  it('accepts valid settings and trims them', () => {
    expect(validateSettings(valid)).toEqual({ ok: true, settings: valid });
    expect(
      validateSettings({
        linearKey: ` ${valid.linearKey}\n`,
        supabaseUrl: `${valid.supabaseUrl}/`,
        supabaseAnonKey: ` ${JWT} `
      })
    ).toEqual({ ok: true, settings: valid });
  });

  it('accepts a publishable key', () => {
    expect(
      fields({ ...valid, supabaseAnonKey: 'sb_publishable_AbC-123_x' })
    ).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['wrong prefix', 'abc_api_123'],
    ['inner space', 'lin_api_ab c'],
    ['prefix only', 'lin_api_x y']
  ])('refuses a Linear key: %s', (_name, linearKey) => {
    expect(fields({ ...valid, linearKey })).toEqual(['linearKey']);
  });

  it.each([
    ['empty', ''],
    ['http', `http://${REF}.supabase.co`],
    ['short ref', 'https://abc.supabase.co'],
    ['uppercase ref', `https://${REF.toUpperCase()}.supabase.co`],
    ['other host', `https://${REF}.example.com`],
    ['subdomain trick', `https://${REF}.supabase.co.evil.com`],
    ['path', `https://${REF}.supabase.co/rest/v1`],
    ['port', `https://${REF}.supabase.co:443`],
    ['userinfo', `https://x@${REF}.supabase.co`]
  ])('refuses a URL: %s', (_name, supabaseUrl) => {
    expect(fields({ ...valid, supabaseUrl })).toEqual(['supabaseUrl']);
  });

  it.each([
    ['empty', ''],
    ['two parts', 'abc.def'],
    ['four parts', 'a.b.c.d'],
    ['bare prefix', 'sb_publishable_'],
    ['inner space', 'eyJ.abc def.ghi']
  ])('refuses an anon key: %s', (_name, supabaseAnonKey) => {
    expect(fields({ ...valid, supabaseAnonKey })).toEqual(['supabaseAnonKey']);
  });

  it('reports every failing field', () => {
    expect(
      fields({ linearKey: '', supabaseUrl: '', supabaseAnonKey: '' })
    ).toEqual(['linearKey', 'supabaseUrl', 'supabaseAnonKey']);
  });
});

describe('settings storage', () => {
  it('round-trips through the store and saves once', async () => {
    const { store, saves } = memoryStore();
    await saveSettings(store, valid);
    expect(saves()).toBe(1);
    expect(await loadSettings(store)).toEqual(valid);
  });

  it('returns null when a value is missing or invalid', async () => {
    expect(await loadSettings(memoryStore().store)).toBeNull();
    expect(
      await loadSettings(
        memoryStore({ ...valid, supabaseUrl: 'https://evil.com' }).store
      )
    ).toBeNull();
    expect(
      await loadSettings(memoryStore({ ...valid, linearKey: 42 }).store)
    ).toBeNull();
  });
});
