import type { Config } from '@codeware/shared/util/payload-types';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

/** A document the tenant has that the definition does not name. */
export type ExtraDocument = {
  collection: string;
  /** The slug, filename or title the tenant knows it by */
  identifier: string;
  id: number;
};

type CollectionSlug = keyof Config['collections'];

/** The fields of a collection that hold a string, which is all this looks at. */
type StringFieldOf<TSlug extends CollectionSlug> = {
  [TField in keyof Config['collections'][TSlug]]-?: NonNullable<
    Config['collections'][TSlug][TField]
  > extends string
    ? TField
    : never;
}[keyof Config['collections'][TSlug]];

type Matcher<TSlug extends CollectionSlug> = {
  collection: TSlug;
  /** Checked against that collection's own fields, not against a string */
  field: StringFieldOf<TSlug> & string;
  named: (definition: SiteDefinition) => Array<string>;
};

/**
 * Declares one matcher with its slug inferred.
 *
 * Written as a call rather than a plain object so `field` is checked against
 * the collection named beside it. A table typed only by `as const` would take
 * any string, and a renamed field would then read as `undefined` — reporting
 * no extras at all, quietly, which is worse than reporting the wrong ones.
 */
const matcher = <TSlug extends CollectionSlug>(entry: Matcher<TSlug>) => entry;

/**
 * How each collection is matched, and what the definition calls its members.
 *
 * Only the collections a definition can state appear here. `navigation` and
 * `site-settings` are one document per tenant, so neither can ever be extra.
 */
const MATCHERS = [
  matcher({
    collection: 'tags',
    field: 'slug',
    named: (d: SiteDefinition) => (d.tags ?? []).map((t) => t.slug)
  }),
  matcher({
    collection: 'categories',
    field: 'slug',
    named: (d: SiteDefinition) => (d.categories ?? []).map((c) => c.slug)
  }),
  matcher({
    collection: 'media',
    field: 'filename',
    named: (d: SiteDefinition) => (d.media ?? []).map((m) => m.filename)
  }),
  matcher({
    collection: 'forms',
    field: 'title',
    named: (d: SiteDefinition) => (d.forms ?? []).map((f) => f.title)
  }),
  matcher({
    collection: 'pages',
    field: 'slug',
    named: (d: SiteDefinition) => d.pages.map((p) => p.slug)
  }),
  matcher({
    collection: 'posts',
    field: 'slug',
    named: (d: SiteDefinition) => (d.posts ?? []).map((p) => p.slug)
  })
];

/**
 * Media is stored with its extension and may have been renamed on upload, so
 * `logo` in a definition and `logo-1.png` in the tenant are the same picture.
 * Everything else matches exactly.
 */
const stem = (value: string) => value.replace(/\.[^.]+$/, '');

/**
 * What a tenant holds that a definition does not name.
 *
 * Applying only fills gaps, which is the right default but leaves a blind
 * spot: content drifts away from its definition silently. This is the other
 * half of the report — not a list of things to delete, a list of things the
 * definition is not describing.
 *
 * It cannot say *why* a document is here. A page an editor wrote and a page a
 * previous apply created and the definition has since dropped look identical,
 * because nothing records which apply produced what. Until something does,
 * every entry is only ever reported.
 *
 * @param payload - Payload instance
 * @param definition - The site, as data
 * @param tenantId - The tenant whose documents to look at
 * @param options - The transaction to read inside, when there is one
 * @returns One entry per document the definition does not name
 */
export async function findExtraDocuments(
  payload: Payload,
  definition: SiteDefinition,
  tenantId: number,
  options: { transactionID?: string | number } = {}
): Promise<Array<ExtraDocument>> {
  const { transactionID } = options;
  const extra: Array<ExtraDocument> = [];

  for (const { collection, field, named } of MATCHERS) {
    const isMedia = collection === 'media';
    const wanted = new Set(
      named(definition).map((value) => (isMedia ? stem(value) : value))
    );

    const { docs } = await payload.find({
      collection,
      where: { tenant: { equals: tenantId } },
      // Payload's unbounded query. A non-zero limit still caps even with
      // `pagination: false`, and a capped scan would under-report extras
      limit: 0,
      depth: 0,
      pagination: false,
      req: transactionID ? { transactionID } : undefined
    });

    for (const doc of docs) {
      // Safe by declaration: `field` was checked against this collection above
      const value = (doc as unknown as Record<string, unknown>)[field];
      if (typeof value !== 'string') {
        continue;
      }

      if (!wanted.has(isMedia ? stem(value) : value)) {
        extra.push({ collection, identifier: value, id: doc.id as number });
      }
    }
  }

  return extra;
}
