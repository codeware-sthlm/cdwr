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
  PostDefinition,
  SiteDefinition,
  SiteSettingsDefinition,
  TagRef
} from './lib/site-definition';
export { manageSeedData, type SeedOptions } from './lib/manage-seed-data';
export { resolveTenantSeedFromSlug } from './lib/resolve-tenant-from-slug';
export type {
  CategoryLookup,
  TagLookup,
  TenantLookup,
  UserLookup
} from './lib/schema';

import { TenantSlug as TenantSlugDev } from './lib/static-data/seed.development';
import { TenantSlug as TenantSlugPreview } from './lib/static-data/seed.preview';

export type { TenantSlugDev, TenantSlugPreview };
