import type { Payload } from 'payload';

import { ensureSiteSetting } from './ensure-site-setting';

const stored = {
  id: 5,
  general: {
    appName: 'Old name',
    landingPage: 1,
    chrome: 'outlined',
    colorScheme: 'dark'
  },
  footer: { tagline: 'Stored tagline' },
  forms: { notificationRecipients: [{ email: 'a@b.se' }] },
  legal: {}
};

const payloadHolding = () => {
  const updates: Array<Record<string, unknown>> = [];
  const payload = {
    find: async () => ({ totalDocs: 1, docs: [stored] }),
    update: async ({ data }: { data: Record<string, unknown> }) => {
      updates.push(data);
      return {};
    },
    create: async () => {
      throw new Error('must not create when a row exists');
    }
  } as unknown as Payload;
  return { payload, updates };
};

const data = {
  tenant: 1,
  general: { appName: 'cdwr.io', chrome: 'flat', landingPage: 9 }
} as unknown as Parameters<typeof ensureSiteSetting>[1];
const base = { locale: 'en' as const, transactionID: undefined };

describe('ensureSiteSetting', () => {
  it('lets every stated field win when the definition is the truth', async () => {
    const { payload, updates } = payloadHolding();

    await ensureSiteSetting(payload, data, { ...base, definitionWins: true });

    expect(updates).toHaveLength(1);
    expect(updates[0]['general']).toEqual({
      appName: 'cdwr.io',
      landingPage: 9,
      // A field with a database default is never a gap, so this is the only
      // way a definition can change it on an existing workspace
      chrome: 'flat',
      // Not stated, so left exactly as stored
      colorScheme: 'dark'
    });
    // Nothing stated about the footer: it is not rewritten at all
    expect(updates[0]).not.toHaveProperty('footer');
  });

  it('leaves a complete row alone by default', async () => {
    const { payload, updates } = payloadHolding();

    await ensureSiteSetting(payload, data, base);

    expect(updates).toEqual([]);
  });
});
