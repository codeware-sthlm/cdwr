export { BUNDLED_MEDIA } from './lib/bundled-media';
export type { BundledMediaFile } from './lib/bundled-media';
export { SiteDefinitionSchema } from './lib/site-definition.schema';
export type { ValidatedSiteDefinition } from './lib/site-definition.schema';
export type {
  BlockDefinition,
  FormDefinition,
  MediaDefinition,
  MediaRef,
  NavigationItemDefinition,
  PageDefinition,
  PlaceDefinition,
  PostDefinition,
  ReusableContentDefinition,
  SiteDefinition,
  SiteSettingsDefinition,
  StockMediaRef,
  TagRef,
  TourDefinition,
  TourItineraryDayDefinition
} from './lib/site-definition';
export { manageSeedData, type SeedOptions } from './lib/manage-seed-data';
export { resolveTenantSeedFromSlug } from './lib/resolve-tenant-from-slug';
export type { TenantLookup } from './lib/schema';

import { TenantSlug as TenantSlugDev } from './lib/static-data/seed.development';

export type { TenantSlugDev };
