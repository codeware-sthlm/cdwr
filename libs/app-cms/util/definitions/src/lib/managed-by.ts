import type { CollectionSlug, Field } from 'payload';

/**
 * The collections a site definition can state, and so the ones an apply owns
 * documents in.
 *
 * One list, used by the collections that carry the field and by the apply
 * that reads it — so a collection cannot gain the field without the apply
 * knowing, or the other way round.
 */
export const managedCollectionSlugs = [
  'tags',
  'categories',
  'media',
  'forms',
  'pages',
  'posts'
] as const satisfies ReadonlyArray<CollectionSlug>;

export type ManagedCollectionSlug = (typeof managedCollectionSlugs)[number];

/**
 * Which site definition created a document, by the definition's `name`.
 *
 * Set when an apply creates the document and never afterwards: a document
 * that already existed is not claimed, because it may be an editor's. That is
 * what lets a fresh apply remove what a definition dropped without ever
 * touching what a person wrote — an extra with no `managedBy` is theirs.
 *
 * Hidden and read-only in the admin: it is provenance, not content.
 */
export const managedByField = (): Field => ({
  name: 'managedBy',
  type: 'text',
  index: true,
  // The local API an apply uses bypasses both; REST and the admin cannot
  access: { create: () => false, update: () => false },
  admin: { hidden: true }
});
