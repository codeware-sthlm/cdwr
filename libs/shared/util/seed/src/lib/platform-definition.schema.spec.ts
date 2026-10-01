import { PlatformDefinitionSchema } from './platform-definition.schema';

/** The smallest thing that should pass. */
const minimal = {
  labels: [],
  stockMedia: [],
  faq: [],
  tenants: [
    {
      name: 'Moon',
      slug: 'moon',
      apiKey: 'key-1',
      description: 'd',
      locale: 'en',
      supportedLocales: ['en']
    }
  ],
  users: []
};

const errorsOf = (definition: unknown): Array<string> => {
  const result = PlatformDefinitionSchema.safeParse(definition);
  return result.success
    ? []
    : result.error.issues.map(({ message }) => message);
};

describe('PlatformDefinitionSchema', () => {
  it('accepts the smallest valid definition', () => {
    expect(PlatformDefinitionSchema.safeParse(minimal).success).toBe(true);
  });

  it('refuses two tenants sharing a slug', () => {
    const definition = {
      ...minimal,
      tenants: [...minimal.tenants, { ...minimal.tenants[0], apiKey: 'key-2' }]
    };

    expect(errorsOf(definition).join(' ')).toContain("'moon'");
  });

  it('refuses two tenants sharing an api key', () => {
    const definition = {
      ...minimal,
      tenants: [...minimal.tenants, { ...minimal.tenants[0], slug: 'star' }]
    };

    expect(errorsOf(definition).join(' ')).toContain("'key-1'");
  });

  it('refuses two users sharing an email', () => {
    const user = {
      name: 'A',
      description: 'd',
      email: 'a@local.dev',
      role: 'user' as const,
      locale: 'en' as const,
      tenants: []
    };
    const definition = { ...minimal, users: [user, user] };

    expect(errorsOf(definition).join(' ')).toContain("'a@local.dev'");
  });

  it('refuses two labels sharing a type and name', () => {
    const label = {
      type: 'place-kind' as const,
      name: 'hotel',
      icon: 'HomeModernIcon'
    };
    const definition = { ...minimal, labels: [label, label] };

    expect(errorsOf(definition).join(' ')).toContain('place-kind:hotel');
  });

  it('refuses two stock media entries sharing a filename', () => {
    const stock = { filename: 'stock-hut-1.jpg', alt: 'A hut' };
    const definition = { ...minimal, stockMedia: [stock, stock] };

    expect(errorsOf(definition).join(' ')).toContain("'stock-hut-1.jpg'");
  });

  it('refuses a stock filename that is not bundled', () => {
    const definition = {
      ...minimal,
      stockMedia: [{ filename: 'not-bundled.jpg', alt: 'A' }]
    };

    expect(errorsOf(definition).length).toBeGreaterThan(0);
  });

  it("refuses a membership naming a tenant this definition doesn't state", () => {
    const definition = {
      ...minimal,
      users: [
        {
          name: 'A',
          description: 'd',
          email: 'a@local.dev',
          role: 'user' as const,
          locale: 'en' as const,
          tenants: [{ lookupSlug: 'nowhere', role: 'admin' as const }]
        }
      ]
    };

    expect(errorsOf(definition).join(' ')).toContain("'nowhere'");
  });

  it('accepts a membership naming a tenant this definition states', () => {
    const definition = {
      ...minimal,
      users: [
        {
          name: 'A',
          description: 'd',
          email: 'a@local.dev',
          role: 'user' as const,
          locale: 'en' as const,
          tenants: [{ lookupSlug: 'moon', role: 'admin' as const }]
        }
      ]
    };

    expect(errorsOf(definition)).toEqual([]);
  });

  it("refuses a stock image's subject naming a label this definition doesn't state", () => {
    const definition = {
      ...minimal,
      stockMedia: [
        { filename: 'stock-hut-1.jpg', alt: 'A hut', subject: 'nowhere' }
      ]
    };

    expect(errorsOf(definition).join(' ')).toContain("'nowhere'");
  });

  it('accepts a stock subject naming a stock-subject label this definition states', () => {
    const definition = {
      ...minimal,
      labels: [
        { type: 'stock-subject' as const, name: 'hut', icon: 'PhotoIcon' }
      ],
      stockMedia: [
        { filename: 'stock-hut-1.jpg', alt: 'A hut', subject: 'hut' }
      ]
    };

    expect(errorsOf(definition)).toEqual([]);
  });

  it('refuses a stock subject naming a label that exists, but not as a stock-subject', () => {
    const definition = {
      ...minimal,
      labels: [
        { type: 'place-kind' as const, name: 'hut', icon: 'HomeModernIcon' }
      ],
      stockMedia: [
        { filename: 'stock-hut-1.jpg', alt: 'A hut', subject: 'hut' }
      ]
    };

    expect(errorsOf(definition).join(' ')).toContain("'hut'");
  });
});
