import type {
  PlatformTenantSlug,
  SiteDefinition
} from '@codeware/shared/util/seed';
import {
  cdwrIo,
  codewareSe,
  moon,
  star
} from '@codeware/shared/util/seed/site-definitions';

/**
 * Which definition fills which seeded workspace.
 *
 * A map rather than a field on the fixture: the tenant entry states identity —
 * name, slug, api key — and a module path in it would be a string nothing
 * checks. Here the compiler does.
 *
 * Exhaustive: a tenant the platform definition states without an entry here
 * fails to compile.
 */
export const SITE_BY_TENANT: Record<PlatformTenantSlug, SiteDefinition> = {
  'cdwr-io': cdwrIo,
  codeware: codewareSe,
  moon,
  star
};
