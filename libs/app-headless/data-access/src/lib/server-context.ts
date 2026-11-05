import type { Env } from '@codeware/app-headless/util/env-schema';

import type { TenantConfig } from './tenant-config';

/** What the server code needs from the running request and process */
export type ServerContext = {
  env: Env;
  appVersion: string;
  loadTenantConfig: () => Promise<TenantConfig | null>;
  requestOrigin: { host: string | null; proto: string | null };
};
