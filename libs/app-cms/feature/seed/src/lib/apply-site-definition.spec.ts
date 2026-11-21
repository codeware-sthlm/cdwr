import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { applySiteDefinition } from './apply-site-definition';
import type { ExtraDocument } from './find-extra-documents';

type EnsureContext = {
  locale: string;
  transactionID?: string | number;
  managedBy?: string;
  definitionWins?: boolean;
};

type Entry = {
  op: 'ensure' | 'update' | 'delete' | 'commit' | 'rollback';
  /** The ensure helper's name, or the collection written */
  target?: string;
  id?: number;
  data?: Record<string, unknown>;
  locale?: string;
  /** Whether the write ran inside the transaction */
  inTransaction?: boolean;
};

const { log, ids, mocks } = vi.hoisted(() => {
  const log: Array<Entry> = [];
  const ids = { next: 100 };

  type Result = { id: number } | number;

  // Every helper creates by default: a document back is `created`, a bare id
  // is `existed`
  type EnsureFn = (
    payload: Payload,
    data: Record<string, unknown>,
    context: EnsureContext
  ) => Promise<Result>;

  const ensure = (name: string) =>
    vi.fn<EnsureFn>(async () => {
      log.push({ op: 'ensure', target: name });
      return { id: ++ids.next };
    });

  return {
    log,
    ids,
    mocks: {
      ensureCategory: ensure('ensureCategory'),
      ensureCustomComponent: ensure('ensureCustomComponent'),
      ensureCustomTheme: ensure('ensureCustomTheme'),
      ensureForm: ensure('ensureForm'),
      ensureMedia: ensure('ensureMedia'),
      ensurePage: ensure('ensurePage'),
      ensurePlace: ensure('ensurePlace'),
      ensurePost: ensure('ensurePost'),
      ensureReusableContent: ensure('ensureReusableContent'),
      ensureSiteSetting: ensure('ensureSiteSetting'),
      ensureTag: ensure('ensureTag'),
      ensureTour: ensure('ensureTour'),
      ensureNavigation: vi.fn<
        (
          payload: Payload,
          data: Record<string, unknown>,
          context: EnsureContext
        ) => Promise<{ navigation: Result }>
      >(async () => {
        log.push({ op: 'ensure', target: 'ensureNavigation' });
        return { navigation: { id: ++ids.next } };
      }),
      findExtraDocuments: vi.fn(async (): Promise<Array<ExtraDocument>> => []),
      removeRecreatedDocuments: vi.fn<
        (
          payload: Payload,
          definition: unknown,
          tenantId: number,
          options: {
            transactionID: string | number | undefined;
            exceptPages?: ReadonlyArray<number>;
          }
        ) => Promise<Array<never>>
      >(async () => []),
      refuseFormsWithSubmissions: vi.fn(async () => undefined)
    }
  };
});

vi.mock('./local-api/ensure-category', () => ({
  ensureCategory: mocks.ensureCategory
}));
vi.mock('./local-api/ensure-custom-component', () => ({
  ensureCustomComponent: mocks.ensureCustomComponent
}));
vi.mock('./local-api/ensure-custom-theme', () => ({
  ensureCustomTheme: mocks.ensureCustomTheme
}));
vi.mock('./local-api/ensure-form', () => ({ ensureForm: mocks.ensureForm }));
vi.mock('./local-api/ensure-media', () => ({ ensureMedia: mocks.ensureMedia }));
vi.mock('./local-api/ensure-navigation', () => ({
  ensureNavigation: mocks.ensureNavigation
}));
vi.mock('./local-api/ensure-page', () => ({ ensurePage: mocks.ensurePage }));
vi.mock('./local-api/ensure-place', () => ({ ensurePlace: mocks.ensurePlace }));
vi.mock('./local-api/ensure-post', () => ({ ensurePost: mocks.ensurePost }));
vi.mock('./local-api/ensure-reusable-content', () => ({
  ensureReusableContent: mocks.ensureReusableContent
}));
vi.mock('./local-api/ensure-site-setting', () => ({
  ensureSiteSetting: mocks.ensureSiteSetting
}));
vi.mock('./local-api/ensure-tag', () => ({ ensureTag: mocks.ensureTag }));
vi.mock('./local-api/ensure-tour', () => ({ ensureTour: mocks.ensureTour }));
vi.mock('./find-extra-documents', () => ({
  findExtraDocuments: mocks.findExtraDocuments
}));
vi.mock('./resolve-rich-text', () => ({
  resolveRichText: async (_payload: Payload, block: unknown) => block
}));
vi.mock('@codeware/app-cms/util/content-templates', () => ({
  convertMarkdownToLexical: vi.fn(async () => ({}))
}));
vi.mock('./remove-managed-documents', async () => ({
  ...(await vi.importActual<typeof import('./remove-managed-documents')>(
    './remove-managed-documents'
  )),
  removeRecreatedDocuments: mocks.removeRecreatedDocuments,
  refuseFormsWithSubmissions: mocks.refuseFormsWithSubmissions
}));

type Doc = Record<string, unknown> & { id: number };

/** What the fake database holds. Reset for every case. */
type World = {
  /** Documents `find` returns, by collection */
  found: Record<string, Array<Doc>>;
  /** Pages `findByID` returns, by id */
  pages: Record<number, Doc>;
  /** What `beginTransaction` hands out */
  transactionID: string | null;
  failMediaDelete: boolean;
};

const freshWorld = (): World => ({
  found: { tenants: [{ id: 1 }], 'site-settings': [] },
  pages: {},
  transactionID: 'tx-1',
  failMediaDelete: false
});

let world = freshWorld();

const warn = vi.fn();

/** A Payload over `world`, writing every change to the shared log. */
const payload = {
  find: async ({ collection }: { collection: string }) => ({
    docs: world.found[collection] ?? []
  }),
  findByID: async ({ id }: { id: number }) => world.pages[id] ?? null,
  count: async ({ collection }: { collection: string }) => ({
    totalDocs: (world.found[collection] ?? []).length
  }),
  update: async ({
    collection,
    id,
    data,
    locale
  }: {
    collection: string;
    id: number;
    data: Record<string, unknown>;
    locale?: string;
  }) => {
    log.push({ op: 'update', target: collection, id, data, locale });
    return { id };
  },
  delete: async ({
    collection,
    id,
    req
  }: {
    collection: string;
    id: number;
    req?: { transactionID?: string };
  }) => {
    if (collection === 'media' && world.failMediaDelete) {
      throw new Error('file is gone');
    }
    log.push({
      op: 'delete',
      target: collection,
      id,
      inTransaction: Boolean(req?.transactionID)
    });
    return { id };
  },
  db: {
    beginTransaction: async () => world.transactionID,
    commitTransaction: async () => {
      log.push({ op: 'commit' });
    },
    rollbackTransaction: async () => {
      log.push({ op: 'rollback' });
    }
  },
  logger: { warn },
  config: {}
} as unknown as Payload;

/** The smallest definition the schema accepts: a name and one page. */
const definitionWith = (
  overrides: Record<string, unknown> = {}
): SiteDefinition =>
  ({
    name: 'acme',
    pages: [{ name: 'Home', slug: 'home', layout: [] }],
    ...overrides
  }) as unknown as SiteDefinition;

const pageNamed = (name: string, slug: string) => ({ name, slug, layout: [] });

const apply = (
  definition: SiteDefinition,
  options: Partial<Parameters<typeof applySiteDefinition>[2]> = {}
) =>
  applySiteDefinition(payload, definition, { tenantSlug: 'moon', ...options });

/** The ordered writes, as `op:target:id`, for assertions on sequence. */
const steps = () =>
  log.map(({ op, target, id }) =>
    [op, target, id].filter((part) => part !== undefined).join(':')
  );

const writes = (op: Entry['op'], target?: string) =>
  log.filter(
    (entry) => entry.op === op && (!target || entry.target === target)
  );

/** The context a helper was first called with. */
const contextOf = (mock: { mock: { calls: Array<Array<unknown>> } }) =>
  mock.mock.calls[0][2] as EnsureContext;

const dataOf = (mock: { mock: { calls: Array<Array<unknown>> } }) =>
  mock.mock.calls[0][1] as Record<string, unknown>;

const extra = (
  collection: string,
  identifier: string,
  id: number,
  owner: ExtraDocument['owner'] = 'this-definition'
): ExtraDocument => ({
  collection,
  identifier,
  id,
  managedBy: owner === 'nobody' ? null : 'acme',
  owner
});

beforeEach(() => {
  world = freshWorld();
  log.length = 0;
  ids.next = 100;
  vi.resetAllMocks();
});

describe('applySiteDefinition', () => {
  describe('transaction', () => {
    it('rolls back and reports a dry run by default', async () => {
      const report = await apply(definitionWith());

      expect(report.dryRun).toBe(true);
      expect(writes('rollback')).toHaveLength(1);
      expect(writes('commit')).toHaveLength(0);
    });

    it('commits with dryRun false and nothing unresolved', async () => {
      const report = await apply(definitionWith(), { dryRun: false });

      expect(report.dryRun).toBe(false);
      expect(report.unresolved).toEqual([]);
      expect(steps().at(-1)).toBe('commit');
      expect(writes('rollback')).toHaveLength(0);
    });

    it('rolls back an unresolved reference even with dryRun false', async () => {
      const report = await apply(
        definitionWith({
          siteSettings: { general: { landingPage: { lookupSlug: 'missing' } } }
        }),
        { dryRun: false }
      );

      expect(report.unresolved).toHaveLength(1);
      expect(report.dryRun).toBe(true);
      expect(writes('commit')).toHaveLength(0);
      expect(writes('rollback')).toHaveLength(1);
    });

    it('rolls back and rethrows when an ensure helper throws', async () => {
      mocks.ensurePage.mockRejectedValueOnce(new Error('boom'));

      await expect(apply(definitionWith(), { dryRun: false })).rejects.toThrow(
        'boom'
      );
      expect(writes('rollback')).toHaveLength(1);
      expect(writes('commit')).toHaveLength(0);
    });

    it('throws before writing when no transaction was started', async () => {
      world.transactionID = null;

      await expect(apply(definitionWith())).rejects.toThrow(
        'started no transaction'
      );
      expect(log).toEqual([]);
    });

    it('throws for an invalid definition', async () => {
      await expect(
        apply(
          definitionWith({
            pages: [{ name: 'Bad', slug: 'Not A Slug', layout: [] }]
          })
        )
      ).rejects.toThrow("Site definition 'acme' is not valid");
      expect(log).toEqual([]);
    });

    it('throws for an unknown tenant', async () => {
      world.found['tenants'] = [];

      await expect(apply(definitionWith())).rejects.toThrow(
        "No tenant with slug 'moon'"
      );
    });

    it('throws when two tenants share the slug', async () => {
      world.found['tenants'] = [{ id: 1 }, { id: 2 }];

      await expect(apply(definitionWith())).rejects.toThrow(
        "More than one tenant has the slug 'moon'"
      );
    });
  });

  describe('locale', () => {
    const withSettings = definitionWith({
      tags: [{ name: 'News', slug: 'news' }],
      siteSettings: { general: { landingPage: { lookupSlug: 'home' } } }
    });

    it('falls back to the first supported locale when no settings row exists', async () => {
      world.found['tenants'] = [{ id: 1, supportedLocales: ['sv'] }];

      await apply(withSettings);

      expect(contextOf(mocks.ensureTag).locale).toBe('sv');
      expect(dataOf(mocks.ensureSiteSetting)['general']).toMatchObject({
        defaultLocale: 'sv'
      });
    });

    it("prefers the settings' default locale over the supported locales", async () => {
      world.found['tenants'] = [{ id: 1, supportedLocales: ['sv'] }];
      world.found['site-settings'] = [
        { id: 5, general: { defaultLocale: 'de' } }
      ];

      await apply(withSettings);

      expect(contextOf(mocks.ensureTag).locale).toBe('de');
    });

    it('prefers an explicit locale over both', async () => {
      world.found['tenants'] = [{ id: 1, supportedLocales: ['sv'] }];
      world.found['site-settings'] = [
        { id: 5, general: { defaultLocale: 'de' } }
      ];

      await apply(withSettings, { locale: 'fr' as never });

      expect(contextOf(mocks.ensureTag).locale).toBe('fr');
      expect(dataOf(mocks.ensureSiteSetting)['general']).toMatchObject({
        defaultLocale: 'fr'
      });
    });

    it('uses en when nothing says otherwise', async () => {
      await apply(withSettings);

      expect(contextOf(mocks.ensureTag).locale).toBe('en');
    });

    it('lets the definition state its own default locale for the settings', async () => {
      await apply(
        definitionWith({
          siteSettings: {
            general: {
              landingPage: { lookupSlug: 'home' },
              defaultLocale: 'sv'
            }
          }
        })
      );

      expect(dataOf(mocks.ensureSiteSetting)['general']).toMatchObject({
        defaultLocale: 'sv'
      });
    });
  });

  describe('owned and plain context', () => {
    const definition = definitionWith({
      tags: [{ name: 'News', slug: 'news' }],
      navigation: [{ reference: { relationTo: 'pages', lookupSlug: 'home' } }],
      siteSettings: { general: { landingPage: { lookupSlug: 'home' } } }
    });

    it('stamps owned collections with the definition name', async () => {
      await apply(definition);

      expect(contextOf(mocks.ensureTag)).toMatchObject({ managedBy: 'acme' });
      expect(contextOf(mocks.ensurePage)).toMatchObject({ managedBy: 'acme' });
    });

    it('gives navigation and site settings no owner and no definitionWins without fresh', async () => {
      await apply(definition);

      for (const mock of [mocks.ensureNavigation, mocks.ensureSiteSetting]) {
        expect(contextOf(mock)).not.toHaveProperty('managedBy');
        expect(contextOf(mock)).toMatchObject({ definitionWins: false });
      }
    });

    it('lets the definition win for navigation and site settings when fresh', async () => {
      await apply(definition, { fresh: true });

      for (const mock of [mocks.ensureNavigation, mocks.ensureSiteSetting]) {
        expect(contextOf(mock)).not.toHaveProperty('managedBy');
        expect(contextOf(mock)).toMatchObject({ definitionWins: true });
      }
    });
  });

  describe('fresh reuse', () => {
    it('reports only recreated documents found existing as kept', async () => {
      mocks.ensureTag.mockResolvedValue(5);
      mocks.ensureMedia.mockResolvedValue(6);
      mocks.ensurePage.mockResolvedValue(7);

      const report = await apply(
        definitionWith({
          tags: [{ name: 'News', slug: 'news' }],
          media: [{ filename: 'a.png', filePath: '/a.png', alt: 'A' }]
        }),
        { fresh: true }
      );

      expect(report.outcomes.map((o) => `${o.collection}:${o.action}`)).toEqual(
        expect.arrayContaining(['tags:existed', 'media:existed'])
      );
      // A page this definition did not create cannot be replaced, so it is kept
      expect(report.kept).toEqual([
        { collection: 'pages', identifier: 'home', action: 'existed' }
      ]);
    });

    it('reports nothing as kept without fresh', async () => {
      mocks.ensurePage.mockResolvedValue(7);

      const report = await apply(definitionWith());

      expect(report.kept).toEqual([]);
    });

    it('leaves the handed-over landing page out of the removal', async () => {
      world.found['site-settings'] = [{ id: 5, general: { landingPage: 9 } }];
      world.pages[9] = { id: 9, slug: 'home', managedBy: 'acme' };

      await apply(definitionWith(), { fresh: true });

      expect(mocks.removeRecreatedDocuments.mock.calls[0][3]).toEqual({
        transactionID: 'tx-1',
        exceptPages: [9]
      });
    });

    it('reports the kept landing page as updated, not existed', async () => {
      world.found['site-settings'] = [{ id: 5, general: { landingPage: 9 } }];
      world.pages[9] = { id: 9, slug: 'home', managedBy: 'acme' };

      const report = await apply(definitionWith(), { fresh: true });

      // Rewritten in place, so the plan must count it as work to do
      expect(report.outcomes).toContainEqual(
        expect.objectContaining({
          collection: 'pages',
          identifier: 'home',
          action: 'updated'
        })
      );
    });

    it('excepts no page when there is no handover', async () => {
      await apply(definitionWith(), { fresh: true });

      expect(mocks.removeRecreatedDocuments.mock.calls[0][3]).toEqual({
        transactionID: 'tx-1',
        exceptPages: []
      });
    });

    describe('dropped documents', () => {
      const tag = extra('tags', 'old', 21);
      const file = extra('media', 'old.png', 22);

      beforeEach(() => {
        mocks.findExtraDocuments.mockResolvedValue([
          tag,
          file,
          // Not this definition's, and a recreated collection: neither is removed here
          extra('tags', 'theirs', 23, 'another-definition'),
          extra('pages', 'gone', 24)
        ]);
      });

      const removedTag = { collection: 'tags', identifier: 'old', id: 21 };
      const removedFile = {
        collection: 'media',
        identifier: 'old.png',
        id: 22
      };

      it('deletes dropped non-media inside the transaction and media after the commit', async () => {
        const report = await apply(definitionWith(), {
          fresh: true,
          dryRun: false
        });

        const order = steps();
        expect(order).toContain('delete:tags:21');
        expect(order.indexOf('delete:tags:21')).toBeLessThan(
          order.indexOf('commit')
        );
        expect(order.indexOf('delete:media:22')).toBeGreaterThan(
          order.indexOf('commit')
        );
        expect(order).not.toContain('delete:tags:23');
        expect(order).not.toContain('delete:pages:24');
        expect(
          writes('delete', 'media').map(({ inTransaction }) => inTransaction)
        ).toEqual([false]);
        expect(report.removed).toEqual([removedTag, removedFile]);
      });

      it('deletes no media on a dry run but still reports it', async () => {
        const report = await apply(definitionWith(), { fresh: true });

        expect(writes('delete', 'media')).toHaveLength(0);
        // Rolled back with everything else
        expect(steps()).toContain('delete:tags:21');
        expect(report.removed).toEqual([removedTag, removedFile]);
      });

      it('logs a warning instead of throwing when a media delete fails', async () => {
        world.failMediaDelete = true;

        const report = await apply(definitionWith(), {
          fresh: true,
          dryRun: false
        });

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('old.png'));
        expect(report.removed).toEqual([removedTag]);
        expect(report.dryRun).toBe(false);
      });
    });
  });

  describe('seo meta', () => {
    const meta = { title: 'Home', description: 'Welcome' };
    const withMeta = () =>
      definitionWith({
        pages: [{ name: 'Home', slug: 'home', layout: [], meta }]
      });

    it('hands a page its meta, and reports it as written', async () => {
      const report = await apply(withMeta());

      expect(dataOf(mocks.ensurePage)).toMatchObject({ meta });
      expect(report.outcomes).toContainEqual({
        collection: 'pages',
        identifier: 'home',
        action: 'created',
        meta: { stated: meta }
      });
    });

    it('hands a post its meta too', async () => {
      await apply(
        definitionWith({
          posts: [{ title: 'Hi', slug: 'hi', content: '', meta }]
        })
      );

      expect(dataOf(mocks.ensurePost)).toMatchObject({ meta });
    });

    it('leaves meta out when the definition states none', async () => {
      const report = await apply(definitionWith());

      expect(dataOf(mocks.ensurePage).meta).toBeUndefined();
      expect(report.outcomes[0]).not.toHaveProperty('meta');
    });

    it('reports a page that exists with other meta, without overwriting it', async () => {
      mocks.ensurePage.mockResolvedValue(7);
      world.pages[7] = {
        id: 7,
        meta: { title: 'Old', description: 'Welcome' }
      };

      const report = await apply(withMeta());

      expect(report.outcomes).toContainEqual({
        collection: 'pages',
        identifier: 'home',
        action: 'existed',
        meta: {
          stated: meta,
          current: { title: 'Old', description: 'Welcome' }
        }
      });
    });

    it('says nothing about a page that exists with the same meta', async () => {
      mocks.ensurePage.mockResolvedValue(7);
      world.pages[7] = { id: 7, meta };

      const report = await apply(withMeta());

      expect(report.outcomes[0]).not.toHaveProperty('meta');
    });
  });

  describe('navigation', () => {
    const home = { reference: { relationTo: 'pages', lookupSlug: 'home' } };

    beforeEach(() => {
      mocks.ensurePage.mockResolvedValue({ id: 7 });
    });

    it('resolves a link to its page and keeps the document label by default', async () => {
      await apply(definitionWith({ navigation: [home] }));

      expect(dataOf(mocks.ensureNavigation)).toMatchObject({
        tenant: 1,
        items: [
          {
            reference: { relationTo: 'pages', value: 7 },
            labelSource: 'document',
            customLabel: null
          }
        ]
      });
    });

    it('sets a custom label source when the link states a label', async () => {
      await apply(
        definitionWith({ navigation: [{ ...home, label: 'Start' }] })
      );

      expect(dataOf(mocks.ensureNavigation)).toMatchObject({
        items: [
          {
            reference: { relationTo: 'pages', value: 7 },
            labelSource: 'custom',
            customLabel: 'Start'
          }
        ]
      });
    });

    it('resolves the children of a group', async () => {
      await apply(
        definitionWith({
          navigation: [{ label: 'More', children: [{ ...home, label: 'Hi' }] }]
        })
      );

      expect(dataOf(mocks.ensureNavigation)).toMatchObject({
        items: [
          {
            label: 'More',
            children: [
              {
                reference: { relationTo: 'pages', value: 7 },
                labelSource: 'custom'
              }
            ]
          }
        ]
      });
    });

    // A dangling link, and a group whose children all dangle, cannot be
    // reached: the schema refuses any link to a page or post the definition
    // does not state, and every stated page and post is in the lookup by then.
  });

  describe('site settings', () => {
    it('resolves the landing, privacy and terms pages and custom themes to ids', async () => {
      const idBySlug: Record<string, number> = {
        home: 11,
        privacy: 12,
        terms: 13
      };
      mocks.ensurePage.mockImplementation(async (_p, data) => ({
        id: idBySlug[data['slug'] as string]
      }));
      mocks.ensureCustomTheme.mockResolvedValue({ id: 31 });

      const report = await apply(
        definitionWith({
          pages: [
            pageNamed('Home', 'home'),
            pageNamed('Privacy', 'privacy'),
            pageNamed('Terms', 'terms')
          ],
          customThemes: [{ name: 'Dusk', slug: 'dusk', recipe: {} }],
          siteSettings: {
            general: {
              landingPage: { lookupSlug: 'home' },
              customThemes: [{ lookupSlug: 'dusk' }]
            },
            legal: {
              privacyPage: { lookupSlug: 'privacy' },
              termsPage: { lookupSlug: 'terms' }
            }
          }
        })
      );

      expect(report.unresolved).toEqual([]);
      expect(dataOf(mocks.ensureSiteSetting)).toMatchObject({
        general: { landingPage: 11, customThemes: [31] },
        legal: { privacyPage: 12, termsPage: 13 },
        tenant: 1
      });
    });

    it('reports a slug that names no page as unresolved', async () => {
      const report = await apply(
        definitionWith({
          siteSettings: {
            general: { landingPage: { lookupSlug: 'nowhere' } },
            legal: { termsPage: { lookupSlug: 'nothing' } }
          }
        })
      );

      expect(report.unresolved).toEqual([
        {
          blockType: 'site-settings',
          field: 'landingPage',
          lookup: 'nowhere'
        },
        { blockType: 'site-settings', field: 'termsPage', lookup: 'nothing' }
      ]);
    });

    it('gives a new workspace default settings pointing at home when none are stated', async () => {
      mocks.ensurePage.mockResolvedValue({ id: 7 });

      await apply(definitionWith());

      expect(dataOf(mocks.ensureSiteSetting)).toMatchObject({
        general: { landingPage: 7, defaultLocale: 'en' },
        tenant: 1
      });
    });

    it('reports a missing home page as unresolved when defaults are needed', async () => {
      const report = await apply(
        definitionWith({ pages: [pageNamed('About', 'about')] })
      );

      expect(report.unresolved).toEqual([
        {
          blockType: 'site-settings',
          field: 'general.landingPage',
          lookup: 'home'
        }
      ]);
      expect(mocks.ensureSiteSetting).not.toHaveBeenCalled();
    });

    it('leaves an existing settings row alone when none are stated', async () => {
      world.found['site-settings'] = [{ id: 5 }];

      const report = await apply(definitionWith());

      expect(mocks.ensureSiteSetting).not.toHaveBeenCalled();
      expect(report.unresolved).toEqual([]);
    });
  });

  describe('landing page handover', () => {
    beforeEach(() => {
      world.found['tenants'] = [{ id: 1, supportedLocales: ['sv'] }];
      world.found['site-settings'] = [
        { id: 5, general: { landingPage: 9, defaultLocale: 'sv' } }
      ];
    });

    it('renames the old landing page, then deletes it once the settings point at the new one', async () => {
      world.pages[9] = { id: 9, slug: 'home', managedBy: 'acme' };

      const report = await apply(
        definitionWith({
          siteSettings: { general: { landingPage: { lookupSlug: 'home' } } }
        }),
        { fresh: true, dryRun: false }
      );

      expect(writes('update', 'pages')).toEqual([
        {
          op: 'update',
          target: 'pages',
          id: 9,
          data: { slug: 'home--replaced-by-fresh-apply' },
          locale: 'sv'
        }
      ]);
      expect(mocks.ensurePage).toHaveBeenCalledTimes(1);

      const order = steps();
      expect(order.indexOf('update:pages:9')).toBeLessThan(
        order.indexOf('ensure:ensureSiteSetting')
      );
      expect(order.indexOf('ensure:ensureSiteSetting')).toBeLessThan(
        order.indexOf('delete:pages:9')
      );
      expect(order.indexOf('delete:pages:9')).toBeLessThan(
        order.indexOf('commit')
      );
      expect(report.removed).toEqual([
        { collection: 'pages', identifier: 'home', id: 9 }
      ]);
    });

    it('updates the kept landing page with the definition content when none is named', async () => {
      world.pages[9] = { id: 9, slug: 'home', managedBy: 'acme' };

      const report = await apply(
        definitionWith({
          pages: [pageNamed('Start', 'home'), pageNamed('About', 'about')]
        }),
        { fresh: true, dryRun: false }
      );

      expect(writes('update', 'pages')).toEqual([
        {
          op: 'update',
          target: 'pages',
          id: 9,
          data: {
            header: undefined,
            layout: [],
            name: 'Start',
            visibility: 'public'
          },
          locale: 'sv'
        }
      ]);
      expect(mocks.ensurePage).toHaveBeenCalledTimes(1);
      expect(dataOf(mocks.ensurePage)).toMatchObject({ slug: 'about' });
      expect(writes('delete', 'pages')).toHaveLength(0);
      expect(report.removed).toEqual([]);
      // Refreshed in place: kept rather than recreated, and reported as an
      // update so the plan counts it as work
      expect(report.kept).toEqual([
        { collection: 'pages', identifier: 'home', action: 'updated' }
      ]);
    });

    it('does not touch a landing page this definition did not create', async () => {
      world.pages[9] = { id: 9, slug: 'home', managedBy: 'other' };

      const report = await apply(
        definitionWith({
          siteSettings: { general: { landingPage: { lookupSlug: 'home' } } }
        }),
        { fresh: true, dryRun: false }
      );

      expect(writes('update')).toHaveLength(0);
      expect(writes('delete', 'pages')).toHaveLength(0);
      expect(report.removed).toEqual([]);
      expect(mocks.ensurePage).toHaveBeenCalledTimes(1);
    });
  });
});
