import type { Env } from '@codeware/app-headless/util/env-schema';

import type { ServerContext } from './server-context';

/** A full `ServerContext` for specs, with any part overridden */
export function testContext(
  overrides: Partial<ServerContext> = {}
): ServerContext {
  return {
    env: { PAYLOAD_URL: 'http://cms.test', TENANT_ID: 'moon' } as Env,
    appVersion: '1.0.0',
    loadTenantConfig: async () => null,
    requestOrigin: { host: null, proto: null },
    ...overrides
  };
}
