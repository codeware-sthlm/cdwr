import {
  type AuthenticatedPayloadOptions,
  getPayloadRuntime
} from '@codeware/app-cms/data-access';

import configPromise from '../payload.config';

/**
 * Get an authenticated Payload instance for server-side operations,
 * along with tenant runtime config if available.
 *
 * The Payload instance is authenticated using the API key defined in environment
 * variables.
 *
 * @returns The Payload instance with authenticated user property and tenant config if available.
 */
export const payloadRuntime = async (
  options: AuthenticatedPayloadOptions = {}
) => {
  const payloadConfig = await configPromise;
  return getPayloadRuntime(payloadConfig, options);
};
