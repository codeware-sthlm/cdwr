import type { CollectionSlug } from 'payload';

import { globalCollectionSlugs } from './global-collections';

/**
 * Collections owned by a tenant, registered with the multi-tenant plugin.
 *
 * The plugin adds a `tenant` field to each of these. A collection left out has
 * no such field, which makes a tenant-scoped access helper fail the query with
 * `Cannot find field for path at tenant` — a 500 rather than a denial.
 */
export const tenantCollectionSlugs = [
  'categories',
  'custom-components',
  'custom-themes',
  'form-submissions',
  'forms',
  'media',
  'pages',
  'places',
  'posts',
  'reusable-content',
  'tags',
  'tour-signups',
  'tours',
  ...globalCollectionSlugs
] as const satisfies readonly CollectionSlug[];

export type TenantCollectionSlug = (typeof tenantCollectionSlugs)[number];

/**
 * Whether a collection slug is tenant owned.
 *
 * @see {@link tenantCollectionSlugs}
 */
export const isTenantCollectionSlug = (slug: string): boolean =>
  (tenantCollectionSlugs as readonly string[]).includes(slug);
