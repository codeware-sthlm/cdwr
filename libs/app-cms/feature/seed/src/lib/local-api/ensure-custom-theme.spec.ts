import {
  type ThemeRecipe,
  buildThemeTokens
} from '@codeware/shared/util/color';
import type { Payload } from 'payload';

import { ensureCustomTheme } from './ensure-custom-theme';

const recipe = {
  baseFamily: 'zinc',
  brandFamily: 'teal',
  surface: 'flat',
  radius: '0.5rem'
} as ThemeRecipe;

const payloadWith = (found: number) => {
  const created: Array<Record<string, unknown>> = [];
  const payload = {
    find: async () => ({ totalDocs: found, docs: [{ id: 7 }] }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return { id: 8, ...data };
    }
  } as unknown as Payload;
  return { payload, created };
};

describe('ensureCustomTheme', () => {
  it('stores the tokens the studio would derive from the same decisions', async () => {
    const { payload, created } = payloadWith(0);
    const overrides = { light: { '--radius': '1rem' } };

    await ensureCustomTheme(
      payload,
      { name: 'Platform', slug: 'platform', recipe, overrides, tenant: 1 },
      { transactionID: undefined, managedBy: 'cdwr.io' }
    );

    const expected = buildThemeTokens(recipe, overrides);
    expect(created[0]).toMatchObject({
      managedBy: 'cdwr.io',
      slug: 'platform',
      tokensLight: expected.light,
      tokensDark: expected.dark,
      overrides: { light: { '--radius': '1rem' }, dark: {} }
    });
  });

  it('leaves a theme the tenant already has alone', async () => {
    const { payload, created } = payloadWith(1);

    const result = await ensureCustomTheme(
      payload,
      { name: 'Platform', slug: 'platform', recipe, tenant: 1 },
      { transactionID: undefined }
    );

    expect(result).toBe(7);
    expect(created).toEqual([]);
  });
});
