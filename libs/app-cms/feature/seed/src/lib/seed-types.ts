import type { SeedOptions, TenantLookup } from '@codeware/shared/util/seed';
import type { Prettify } from '@codeware/shared/util/typesafe';
import type { TypedLocale } from 'payload';

import type { FaqData } from './local-api/ensure-faq';
import type { StockMediaData } from './local-api/ensure-stock-media';
import type { TenantData } from './local-api/ensure-tenant';
import type { UserData } from './local-api/ensure-user';
export type SeedEnvironment = 'development' | 'preview' | 'production';

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
  stockMedia: Array<StockMediaDataLookup>;
  tenants: Array<TenantDataLookup>;
  users: Array<UserDataLookup>;
};

export type StaticSeedOptions = Pick<SeedOptions, 'remoteDataUrl'>;
