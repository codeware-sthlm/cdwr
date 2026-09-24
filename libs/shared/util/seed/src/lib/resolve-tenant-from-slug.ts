import { manageSeedData } from './manage-seed-data';

/**
 * Resolve tenant seed data from slug.
 *
 * Aimed at being used in **development** to simulate multi-tenancy.
 *
 * @param slug - The tenant slug to resolve the tenant from.
 * @returns Tenant seed data, or `null` when the seed does not describe it.
 */
export const resolveTenantSeedFromSlug = async (slug: string) => {
  if (!slug) {
    console.error('Slug is required to resolve tenant');
    return null;
  }

  // Load seed data for development
  const seedData = manageSeedData.load('development');
  if (!seedData) {
    console.error('No seed data available to resolve tenant');
    return null;
  }

  // Lookup tenant by matching against tenant slugs
  // Not finding one is not an error here: the seed describes the workspaces it
  // created and nothing else, and a caller may well have another way to
  // resolve the tenant. Each caller says what a miss means for it
  return seedData.tenants.find((t) => t.slug === slug) ?? null;
};
