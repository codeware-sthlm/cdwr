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

  it('fills in an icon on an otherwise complete row', async () => {
    // Payload hands back an empty group rather than null
    const emptyIcon = { source: null, svgCode: null, file: null };
    const holding = {
      ...stored,
      general: { ...stored.general, icon: emptyIcon }
    };
    const updates: Array<Record<string, unknown>> = [];
    const payload = {
      find: async () => ({ totalDocs: 1, docs: [holding] }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      }
    } as unknown as Payload;
    const icon = { source: 'svg', svgCode: '<svg viewBox="0 0 1 1"/>' };

    await ensureSiteSetting(
      payload,
      { ...data, general: { ...data.general, icon } } as typeof data,
      base
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]['general']).toMatchObject({ icon });
  });

  describe('themes on an existing row', () => {
    const holding = (general: Record<string, unknown>) => {
      const updates: Array<Record<string, unknown>> = [];
      const payload = {
        find: async () => ({
          totalDocs: 1,
          docs: [{ ...stored, general: { ...stored.general, ...general } }]
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        }
      } as unknown as Payload;
      return { payload, updates };
    };
    const stating = {
      ...data,
      general: {
        ...data.general,
        themes: ['frost', 'codeware'],
        customThemes: [42],
        defaultTheme: 'cdwr'
      }
    } as typeof data;

    it('fills the fields still at their defaults', async () => {
      const { payload, updates } = holding({
        themes: ['spotlight'],
        customThemes: [],
        defaultTheme: 'spotlight'
      });

      await ensureSiteSetting(payload, stating, base);

      expect(updates).toHaveLength(1);
      expect(updates[0]['general']).toMatchObject({
        themes: ['frost', 'codeware'],
        customThemes: [42],
        defaultTheme: 'cdwr'
      });
    });

    it('keeps what an editor chose', async () => {
      const { payload, updates } = holding({
        themes: ['lingon'],
        customThemes: [7],
        defaultTheme: 'lingon'
      });

      await ensureSiteSetting(payload, stating, base);

      expect(updates).toEqual([]);
    });

    it('does not rewrite a row that already says the same', async () => {
      const { payload, updates } = holding({
        themes: ['frost', 'codeware'],
        customThemes: [42],
        defaultTheme: 'cdwr'
      });

      await ensureSiteSetting(payload, stating, base);

      expect(updates).toEqual([]);
    });
  });
});
