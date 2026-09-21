import { SiteDefinitionSchema } from './site-definition.schema';

/** The smallest thing that should pass. */
const minimal = {
  name: 'Example',
  pages: [{ name: 'Home', slug: 'home', layout: [] }]
};

const errorsOf = (definition: unknown): Array<string> => {
  const result = SiteDefinitionSchema.safeParse(definition);
  return result.success
    ? []
    : result.error.issues.map(({ message }) => message);
};

describe('SiteDefinitionSchema', () => {
  it('accepts a definition that only states pages', () => {
    expect(SiteDefinitionSchema.safeParse(minimal).success).toBe(true);
  });

  it('requires at least a name and pages', () => {
    expect(errorsOf({ name: 'Example' }).length).toBeGreaterThan(0);
    expect(errorsOf({ pages: [] }).length).toBeGreaterThan(0);
  });

  describe('carries no identity', () => {
    // The reason this schema exists: a definition lives in version control and
    // may be generated, and neither is a place for a tenant's api key
    it.each([
      ['apiKey', { ...minimal, apiKey: 'secret' }],
      ['tenant', { ...minimal, tenant: 'moon' }],
      [
        'lookupApiKey',
        {
          ...minimal,
          pages: [
            {
              name: 'Home',
              slug: 'home',
              layout: [{ blockType: 'hero', lookupApiKey: 'secret' }]
            }
          ]
        }
      ],
      ['users', { ...minimal, users: [] }],
      [
        'password',
        { ...minimal, siteSettings: { general: { password: 'hunter2' } } }
      ]
    ])('refuses %s, wherever it appears', (key, definition) => {
      expect(errorsOf(definition).join(' ')).toContain(`'${key}'`);
    });

    it('finds one nested deep inside a block', () => {
      const buried = {
        ...minimal,
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              { blockType: 'card', cards: [{ brand: { apiKey: 'secret' } }] }
            ]
          }
        ]
      };

      expect(errorsOf(buried).join(' ')).toContain("'apiKey'");
    });
  });

  describe('references resolve within the definition', () => {
    it('refuses navigation pointing at a page it does not state', () => {
      const definition = {
        ...minimal,
        navigation: [
          { reference: { relationTo: 'pages', lookupSlug: 'nowhere' } }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'nowhere'");
    });

    it('accepts navigation pointing at a page it does state', () => {
      const definition = {
        ...minimal,
        navigation: [{ reference: { relationTo: 'pages', lookupSlug: 'home' } }]
      };

      expect(errorsOf(definition)).toEqual([]);
    });

    it('refuses a block referring to media it does not state', () => {
      // How a page ships without its image: the apply resolves the reference to
      // nothing and drops it, saying so only in a log nobody reads
      const definition = {
        ...minimal,
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              { blockType: 'hero', media: { lookupFilename: 'missing.jpg' } }
            ]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain('missing.jpg');
    });

    it('accepts one that refers to media it does state', () => {
      const definition = {
        ...minimal,
        media: [{ filename: 'hero.jpg', alt: 'A hero', filePath: '/a/b.jpg' }],
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              { blockType: 'hero', media: { lookupFilename: 'hero.jpg' } }
            ]
          }
        ]
      };

      expect(errorsOf(definition)).toEqual([]);
    });

    it('refuses media tagged with a tag it does not state', () => {
      const definition = {
        ...minimal,
        media: [
          {
            filename: 'a.jpg',
            alt: 'A',
            filePath: '/a.jpg',
            tags: [{ lookupSlug: 'absent' }]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'absent'");
    });
  });

  describe('slugs', () => {
    it('refuses two pages with the same slug', () => {
      const definition = {
        ...minimal,
        pages: [
          { name: 'Home', slug: 'home', layout: [] },
          { name: 'Home again', slug: 'home', layout: [] }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'home'");
    });

    it.each(['Home', 'my page', 'trailing-', '--'])(
      'refuses %s as a slug',
      (slug) => {
        const definition = {
          ...minimal,
          pages: [{ name: 'A', slug, layout: [] }]
        };

        expect(errorsOf(definition).length).toBeGreaterThan(0);
      }
    );
  });

  it('keeps a block it does not understand, rather than refusing it', () => {
    // Block internals are Payload's to judge, inside the rolled-back
    // transaction the dry run uses. This schema only asks that it is a block
    const definition = {
      ...minimal,
      pages: [
        {
          name: 'Home',
          slug: 'home',
          layout: [{ blockType: 'hero', whateverPayloadWants: 42 }]
        }
      ]
    };

    const result = SiteDefinitionSchema.safeParse(definition);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages[0].layout[0]).toMatchObject({
        whateverPayloadWants: 42
      });
    }
  });
});
