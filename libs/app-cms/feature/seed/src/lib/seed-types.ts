import type { SeedOptions, TenantLookup } from '@codeware/shared/util/seed';
import type { Prettify } from '@codeware/shared/util/typesafe';
import type { TypedLocale } from 'payload';

import type { FaqData } from './local-api/ensure-faq';
import type { PlaceData } from './local-api/ensure-place';
import type { StockMediaData } from './local-api/ensure-stock-media';
import type { TenantData } from './local-api/ensure-tenant';
import type { TourData } from './local-api/ensure-tour';
import type { UserData } from './local-api/ensure-user';
export type SeedEnvironment = 'development' | 'preview' | 'production';

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
  faq: Array<FaqData>;
  places: Array<PlaceDataLookup>;
  stockMedia: Array<StockMediaDataLookup>;
  tenants: Array<TenantDataLookup>;
  tours: Array<TourDataLookup>;
  users: Array<UserDataLookup>;
};

export type StaticSeedOptions = Pick<SeedOptions, 'remoteDataUrl'>;
