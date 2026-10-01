import type { CollectionConfig } from 'payload';

import categories from './categories/categories.collection';
import customComponents from './custom-components/custom-components.collection';
import customThemes from './custom-themes/custom-themes.collection';
import faq from './faq/faq.collection';
import media from './media/media.collection';
import navigation from './navigation/navigation.collection';
import pages from './pages/pages.collection';
import places from './places/places.collection';
import platformLabels from './platform-labels/platform-labels.collection';
import platformSettings from './platform-settings/platform-settings.collection';
import posts from './posts/posts.collection';
import reusableContent from './reusable-content/reusable-content.collection';
import siteSettings from './site-settings/site-settings.collection';
import stockMedia from './stock-media/stock-media.collection';
import tags from './tags/tags.collection';
import tenants from './tenants/tenants.collection';
import tourSignups from './tour-signups/tour-signups.collection';
import tours from './tours/tours.collection';
import users from './users/users.collection';

/**
 * Every collection the CMS registers.
 *
 * Kept apart from `payload.config.ts` so it can be imported without the env
 * the rest of the config needs — `collections.spec.ts` asserts invariants
 * across this list, and a second hardcoded copy would defeat the point.
 */
export const collections: Array<CollectionConfig> = [
  categories,
  customComponents,
  customThemes,
  faq,
  media,
  navigation,
  pages,
  places,
  platformLabels,
  platformSettings,
  posts,
  reusableContent,
  siteSettings,
  stockMedia,
  tags,
  tenants,
  tourSignups,
  tours,
  users
];

/** The auth collection the admin panel logs into */
export { users };
