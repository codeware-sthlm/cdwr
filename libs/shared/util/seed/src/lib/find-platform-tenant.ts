import { platform } from './platform/platform';

/**
 * A tenant the platform definition states, by slug.
 *
 * How development finds a seeded workspace's api key without one in the
 * environment.
 *
 * @param slug - The tenant slug
 * @returns The tenant, or `null` when the platform does not state it
 */
export const findPlatformTenant = (slug: string) =>
  // A miss is not an error here: a caller may have another way to resolve the
  // tenant, so each one says what a miss means for it
  platform.tenants.find((tenant) => tenant.slug === slug) ?? null;
