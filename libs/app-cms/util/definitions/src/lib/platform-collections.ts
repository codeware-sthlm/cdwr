import type { CollectionSlug } from 'payload';

/**
 * Collections owned by the platform rather than a tenant.
 *
 * Deliberately left out of the multi-tenant plugin: one set of documents is
 * shared by every workspace and only system users maintain them. They carry no
 * `tenant` field, so a tenant-scoped access helper cannot be used on them.
 */
export const platformCollectionSlugs = [
  'faq',
  'platform-labels',
  'platform-settings',
  'stock-media'
] as const satisfies readonly CollectionSlug[];

export type PlatformCollectionSlug = (typeof platformCollectionSlugs)[number];

/**
 * Whether a collection slug is platform owned.
 *
 * @see {@link platformCollectionSlugs}
 */
export const isPlatformCollectionSlug = (slug: string): boolean =>
  (platformCollectionSlugs as readonly string[]).includes(slug);

/**
 * Collections only system users can see or touch.
 *
 * Platform owned like {@link platformCollectionSlugs}, but not even readable
 * by an editor or a tenant api key, so there is nothing for them to browse.
 */
export const systemCollectionSlugs = [
  'invite-codes'
] as const satisfies readonly CollectionSlug[];

export type SystemCollectionSlug = (typeof systemCollectionSlugs)[number];
