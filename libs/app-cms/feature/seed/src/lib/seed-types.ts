import type {
  CategoryLookup,
  SeedOptions,
  TagLookup,
  TenantLookup,
  UserLookup
} from '@codeware/shared/util/seed';
import type { Prettify } from '@codeware/shared/util/typesafe';
import type { TypedLocale } from 'payload';

import type { CategoryData } from './local-api/ensure-category';
import type { FaqData } from './local-api/ensure-faq';
import type { MediaData } from './local-api/ensure-media';
import type { PageData } from './local-api/ensure-page';
import type { PlaceData } from './local-api/ensure-place';
import type { PostData } from './local-api/ensure-post';
import type { StockMediaData } from './local-api/ensure-stock-media';
import type { TagData } from './local-api/ensure-tag';
import type { TenantData } from './local-api/ensure-tenant';
import type { TourData } from './local-api/ensure-tour';
import type { UserData } from './local-api/ensure-user';
export type SeedEnvironment = 'development' | 'preview' | 'production';

type CategoryDataLookup = Prettify<
  Omit<CategoryData, 'slug' | 'tenant'> & {
    slug: string;
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type MediaDataLookup = Prettify<
  Omit<MediaData, 'tags' | 'tenant'> & {
    tags: Array<TagLookup>;
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type PostDataLookup = Prettify<
  Omit<PostData, 'authors' | 'categories' | 'content' | 'tenant'> & {
    authors: Array<UserLookup>;
    categories: Array<CategoryLookup>;
    content: string; // Markdown content
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type PageDataLookup = Prettify<
  Omit<PageData, 'layout' | 'tenant'> & {
    layoutContent?: string;
    hero?: {
      badge?: string;
      heading: string;
      lede: string;
      actions?: Array<{
        link: { url: string; label: string; newTab?: boolean };
        emphasis?: 'primary' | 'secondary';
      }>;
    };
    featureCards?: {
      eyebrow?: string;
      heading: string;
      intro?: string;
      columns?: 'auto' | '2' | '3' | '4';
      items?: Array<{
        brand?: { icon?: string; color?: string };
        title: string;
        description: string;
      }>;
    };
    callout?: {
      showMark?: boolean;
      heading: string;
      body?: string;
      link: { url: string; label: string; newTab?: boolean };
    };
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type TagDataLookup = Prettify<
  Omit<TagData, 'brand' | 'slug' | 'tenant'> & {
    brand: NonNullable<TagData['brand']>;
    slug: string;
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type PlaceDataLookup = Prettify<
  Omit<PlaceData, 'kind' | 'tenant'> & {
    kind: string; // Platform label name, resolved to a document by the seed
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type TourDataLookup = Prettify<
  Omit<
    TourData,
    | 'content'
    | 'heroImage'
    | 'included'
    | 'itinerary'
    | 'notIncluded'
    | 'tenant'
  > & {
    content: string; // Markdown content
    heroImage: string; // Stock media filename
    intent: 'booking' | 'interest';
    included: Array<string>;
    notIncluded: Array<string>;
    itinerary: Array<{
      title: string;
      description?: string;
      places?: Array<string>; // Place names
    }>;
    tenant: Pick<TenantLookup, 'lookupApiKey'>;
  }
>;
type StockMediaDataLookup = Prettify<
  Omit<StockMediaData, 'subject'> & {
    subject?: string; // Subject name, resolved to a document by the seed
  }
>;
type UserDataLookup = Prettify<
  Omit<UserData, 'tenants' | 'password'> & {
    tenants: Array<TenantLookup>;
    password: string;
    locale: TypedLocale;
  }
>;
export type TenantDataLookup = Prettify<
  Omit<TenantData, 'apiKey'> & {
    apiKey: string;
    locale: TypedLocale;
  }
>;

// TODO: infer from seedDataSchema when it's refactored
export type SeedData = {
  categories: Array<CategoryDataLookup>;
  faq: Array<FaqData>;
  media: Array<MediaDataLookup>;
  pages: Array<PageDataLookup>;
  places: Array<PlaceDataLookup>;
  stockMedia: Array<StockMediaDataLookup>;
  posts: Array<PostDataLookup>;
  tags: Array<TagDataLookup>;
  tenants: Array<TenantDataLookup>;
  tours: Array<TourDataLookup>;
  users: Array<UserDataLookup>;
};

export type StaticSeedOptions = Pick<SeedOptions, 'remoteDataUrl'>;
