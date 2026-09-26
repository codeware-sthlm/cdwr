import type {
  SiteDefinition,
  TenantSlugDev,
  TenantSlugPreview
} from '@codeware/shared/util/seed';
import {
  bamse,
  cdwrIo,
  marvel,
  moon,
  star,
  starWars,
  sun
} from '@codeware/shared/util/seed/site-definitions';

type TenantSlug = TenantSlugDev | TenantSlugPreview;

/**
 * Which definition fills which seeded workspace.
 *
 * A map rather than a field on the fixture: the tenant entry states identity —
 * name, slug, api key — and a module path in it would be a string nothing
 * checks. Here the compiler does.
 *
 * Fully typed to ensure that each defined tenant slug has a corresponding site definition.
 */
const BY_SLUG: Record<TenantSlug, SiteDefinition> = {
  bamse,
  'cdwr-io': cdwrIo,
  marvel,
  moon,
  star,
  sun,
  'star-wars': starWars
};

/** The definition for a seeded tenant, or nothing if it has none. */
export const definitionFor = (slug: string): SiteDefinition | undefined =>
  isSeededSlug(slug) ? BY_SLUG[slug] : undefined;

/** Narrows a slug read from the database to one this map was written for. */
const isSeededSlug = (slug: string): slug is TenantSlug =>
  Object.hasOwn(BY_SLUG, slug);
