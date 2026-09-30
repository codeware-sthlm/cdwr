import type { SiteDefinition, TenantSlugDev } from '@codeware/shared/util/seed';
import {
  cdwrIo,
  codewareSe,
  moon,
  star
} from '@codeware/shared/util/seed/site-definitions';

type TenantSlug = TenantSlugDev;

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
  'cdwr-io': cdwrIo,
  codeware: codewareSe,
  moon,
  star
};

/** The definition for a seeded tenant, or nothing if it has none. */
export const definitionFor = (slug: string): SiteDefinition | undefined =>
  isSeededSlug(slug) ? BY_SLUG[slug] : undefined;

/** Narrows a slug read from the database to one this map was written for. */
const isSeededSlug = (slug: string): slug is TenantSlug =>
  Object.hasOwn(BY_SLUG, slug);
