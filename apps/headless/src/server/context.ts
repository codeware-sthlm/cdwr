import {
  type ServerContext,
  createTenantConfigLoader
} from '@codeware/app-headless/data-access';
import { getRequestHeader } from '@tanstack/react-start/server';

import pkg from '../../package.json';
import { getEnv } from '../env.server';

/** One cache for the process */
export const loadTenantConfig = createTenantConfigLoader(getEnv);

/** What the data-access functions need, read from the running request */
export function serverContext(): ServerContext {
  return {
    env: getEnv(),
    appVersion: pkg.version,
    loadTenantConfig,
    requestOrigin: {
      host: getRequestHeader('host') ?? null,
      proto: getRequestHeader('x-forwarded-proto') ?? null
    }
  };
}
