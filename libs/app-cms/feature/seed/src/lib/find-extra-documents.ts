import type { ManagedCollectionSlug } from '@codeware/app-cms/util/definitions';
import type { Config } from '@codeware/shared/util/payload-types';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

/**
 * Who put an extra document there, as far as anything recorded it.
 *
 * - `this-definition` — an earlier apply of this definition created it, and the
 *   definition has since dropped it. Safe to remove.
 * - `another-definition` — some other definition's. Not this one's to touch.
 * - `nobody` — no apply created it: an editor wrote it, or it predates the
 *   record. Never removed by any apply.
 */
export type ExtraOwner = 'this-definition' | 'another-definition' | 'nobody';

/** A document the tenant has that the definition does not name. */
export type ExtraDocument = {
  collection: string;
  /** The slug, filename or title the tenant knows it by */
  identifier: string;
  id: number;
  /** The definition that created it, or `null` when none did */
  managedBy: string | null;
  owner: ExtraOwner;
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
 * Every collection that carries `managedBy` is matched here, and nothing else.
 *
 * A collection given the field without a matcher would never report its
 * extras, so a fresh apply would never remove what a definition dropped there
 * — quietly. This fails the build instead.
 */
type MatchedSlug = (typeof MATCHERS)[number]['collection'];
type ExactlyTheManaged = [ManagedCollectionSlug] extends [MatchedSlug]
  ? [MatchedSlug] extends [ManagedCollectionSlug]
    ? true
    : 'a matcher names a collection without managedBy'
  : 'a collection with managedBy has no matcher';
const everyManagedCollectionIsMatched: ExactlyTheManaged = true;
void everyManagedCollectionIsMatched;

const stem = (value: string) => value.replace(/\.[^.]+$/, '');

/**
 * Whether a stored file is the one a definition asked for.
 *
 * Uploading renames: a definition states `abstract-image-1.jpg` and the tenant
 * ends up with `moon-abstract-image-1.jpg`. `ensureMedia` finds it again with a
 * `contains` on the stem, so this has to ask the same question — matching
 * exactly here would report every media file as extra while the apply reported
 * the very same file as already there.
 */
const isNamedMedia = (stored: string, wanted: Set<string>) =>
  [...wanted].some((name) => stem(stored).includes(stem(name)));

/**
 * What a tenant holds that a definition does not name.
 *
 * Applying only fills gaps, which is the right default but leaves a blind
 * spot: content drifts away from its definition silently. This is the other
 * half of the report — not a list of things to delete, a list of things the
 * definition is not describing.
 *
 * Each entry says who put it there, from the `managedBy` an apply writes on
 * create: a page this definition created and has since dropped is removable,
 * one an editor wrote never is. Documents created before the field existed
 * carry none, so they read as `nobody` — the safe answer.
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
    const wanted = new Set(named(definition));

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

      const named = isMedia ? isNamedMedia(value, wanted) : wanted.has(value);

      if (!named) {
        const managedBy = doc.managedBy ?? null;

        extra.push({
          collection,
          identifier: value,
          id: doc.id as number,
          managedBy,
          owner:
            managedBy === null
              ? 'nobody'
              : managedBy === definition.name
                ? 'this-definition'
                : 'another-definition'
        });
      }
    }
  }

  return extra;
}
