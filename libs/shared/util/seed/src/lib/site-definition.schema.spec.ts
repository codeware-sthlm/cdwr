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

  describe('slug references inside arrays', () => {
    it('refuses a post in a category the definition does not state', () => {
      const definition = {
        ...minimal,
        posts: [
          {
            title: 'A post',
            slug: 'a-post',
            content: 'Text',
            categories: [{ lookupSlug: 'absent' }]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("category 'absent'");
    });

    it('refuses a file area filtered by a tag the definition does not state', () => {
      const definition = {
        ...minimal,
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              { blockType: 'file-area', tags: [{ lookupSlug: 'absent' }] }
            ]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("tag 'absent'");
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

  it('refuses a link that points at a document by id', () => {
    const errors = errorsOf({
      ...minimal,
      pages: [
        {
          name: 'Home',
          slug: 'home',
          layout: [
            {
              blockType: 'hero',
              heading: 'Hi',
              actions: [
                {
                  link: {
                    type: 'reference',
                    label: 'Go',
                    reference: { relationTo: 'pages', value: 42 }
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    expect(errors).toContainEqual(expect.stringContaining('by id'));
  });

  it('allows a custom link, which carries no identity', () => {
    const errors = errorsOf({
      ...minimal,
      pages: [
        {
          name: 'Home',
          slug: 'home',
          layout: [
            {
              blockType: 'hero',
              heading: 'Hi',
              actions: [
                { link: { type: 'custom', url: '/blocks', label: 'Go' } }
              ]
            }
          ]
        }
      ]
    });

    expect(errors).toEqual([]);
  });

  it('refuses a form reference the definition does not state', () => {
    const errors = errorsOf({
      ...minimal,
      pages: [
        {
          name: 'Home',
          slug: 'home',
          layout: [{ blockType: 'form', form: { lookupTitle: 'Nowhere' } }]
        }
      ]
    });

    expect(errors).toContainEqual("No form named 'Nowhere' in this definition");
  });

  it('accepts a form reference the definition states', () => {
    const errors = errorsOf({
      ...minimal,
      forms: [{ title: 'Contact', confirmation: 'Thanks' }],
      pages: [
        {
          name: 'Home',
          slug: 'home',
          layout: [{ blockType: 'form', form: { lookupTitle: 'Contact' } }]
        }
      ]
    });

    expect(errors).toEqual([]);
  });

  describe('custom components', () => {
    const component = { name: 'Metric card', slug: 'metric-card', source: 'x' };
    const pageWith = (slug: string) => [
      {
        name: 'Home',
        slug: 'home',
        layout: [
          { blockType: 'custom-component', component: { lookupSlug: slug } }
        ]
      }
    ];

    it('refuses two components sharing a slug', () => {
      const definition = {
        ...minimal,
        customComponents: [component, component]
      };

      expect(errorsOf(definition).join(' ')).toContain("'metric-card'");
    });

    it('refuses a block referring to a component it does not state', () => {
      const definition = { ...minimal, pages: pageWith('nowhere') };

      expect(errorsOf(definition)).toContainEqual(
        "No custom component 'nowhere' in this definition"
      );
    });

    it('accepts a block referring to a component it states', () => {
      const definition = {
        ...minimal,
        customComponents: [component],
        pages: pageWith('metric-card')
      };

      expect(errorsOf(definition)).toEqual([]);
    });
  });

  describe('reusable content', () => {
    it('refuses two entries sharing a title', () => {
      const definition = {
        ...minimal,
        reusableContent: [
          { title: 'Shared', layout: [] },
          { title: 'Shared', layout: [] }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'Shared'");
    });

    it('refuses a block referring to reusable content it does not state', () => {
      const definition = {
        ...minimal,
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              {
                blockType: 'reusable-content',
                reusableContent: { lookupTitle: 'Nowhere' }
              }
            ]
          }
        ]
      };

      expect(errorsOf(definition)).toContainEqual(
        "No reusable content named 'Nowhere' in this definition"
      );
    });

    it('accepts a block referring to reusable content it states, and validates its own layout the same way pages are', () => {
      const definition = {
        ...minimal,
        media: [{ filename: 'hero.jpg', alt: 'A hero', filePath: '/a/b.jpg' }],
        reusableContent: [
          {
            title: 'Shared',
            layout: [
              { blockType: 'image', media: { lookupFilename: 'hero.jpg' } }
            ]
          }
        ],
        pages: [
          {
            name: 'Home',
            slug: 'home',
            layout: [
              {
                blockType: 'reusable-content',
                reusableContent: { lookupTitle: 'Shared' }
              }
            ]
          }
        ]
      };

      expect(errorsOf(definition)).toEqual([]);
    });

    it("refuses a reference inside its own layout that does not resolve, the same way a page's would", () => {
      const definition = {
        ...minimal,
        reusableContent: [
          {
            title: 'Shared',
            layout: [
              { blockType: 'image', media: { lookupFilename: 'missing.jpg' } }
            ]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain('missing.jpg');
    });
  });

  describe('places and tours', () => {
    it('refuses two places sharing a name', () => {
      const definition = {
        ...minimal,
        places: [
          { name: 'The Hut', kind: 'hotel' },
          { name: 'The Hut', kind: 'activity' }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'The Hut'");
    });

    it('refuses two tours sharing a slug', () => {
      const definition = {
        ...minimal,
        tours: [
          {
            title: 'A',
            slug: 'a-tour',
            heroImage: { lookupFilename: 'stock-a.jpg' },
            content: 'hi'
          },
          {
            title: 'B',
            slug: 'a-tour',
            heroImage: { lookupFilename: 'stock-b.jpg' },
            content: 'hi'
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'a-tour'");
    });

    it("refuses an itinerary naming a place the definition doesn't state", () => {
      const definition = {
        ...minimal,
        tours: [
          {
            title: 'A',
            slug: 'a-tour',
            heroImage: { lookupFilename: 'stock-a.jpg' },
            content: 'hi',
            itinerary: [{ title: 'Day 1', places: [{ lookupName: 'Nowhere' }] }]
          }
        ]
      };

      expect(errorsOf(definition).join(' ')).toContain("'Nowhere'");
    });

    it('accepts an itinerary naming a place the definition states', () => {
      const definition = {
        ...minimal,
        places: [{ name: 'The Hut', kind: 'hotel' }],
        tours: [
          {
            title: 'A',
            slug: 'a-tour',
            heroImage: { lookupFilename: 'stock-a.jpg' },
            content: 'hi',
            itinerary: [{ title: 'Day 1', places: [{ lookupName: 'The Hut' }] }]
          }
        ]
      };

      expect(errorsOf(definition)).toEqual([]);
    });

    it("never checks a tour's hero image against this definition's media — it names the platform's stock library instead", () => {
      const definition = {
        ...minimal,
        tours: [
          {
            title: 'A',
            slug: 'a-tour',
            heroImage: { lookupFilename: 'stock-not-in-media.jpg' },
            content: 'hi'
          }
        ]
      };

      expect(errorsOf(definition)).toEqual([]);
    });
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
