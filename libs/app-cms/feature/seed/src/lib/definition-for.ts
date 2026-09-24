import type { SiteDefinition } from '@codeware/shared/util/seed';
import {
  bamse,
  marvel,
  moon,
  star,
  starWars,
  sun
} from '@codeware/shared/util/seed/site-definitions';

/**
 * Which definition fills which seeded workspace.
 *
 * A map rather than a field on the fixture: the tenant entry states identity —
 * name, slug, api key — and a module path in it would be a string nothing
 * checks. Here the compiler does.
 */
const BY_SLUG: Record<string, SiteDefinition> = {
  moon,
  star,
  sun,
  'star-wars': starWars,
  marvel,
  bamse
};

/** The definition for a seeded tenant, or nothing if it has none. */
export const definitionFor = (slug: string): SiteDefinition | undefined =>
  BY_SLUG[slug];
