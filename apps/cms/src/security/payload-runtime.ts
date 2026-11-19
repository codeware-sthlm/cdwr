import {
  type AuthenticatedPayloadOptions,
  getPayloadRuntime
} from '@codeware/app-cms/data-access';
import { cache } from 'react';

import configPromise from '../payload.config';

// One runtime per request and identity: the layout, the metadata and the page
// all ask for it, and each build runs the auth lookup, the site settings and
// the themes again. `cache` matches arguments with `Object.is`, so the key is
// the boolean and not the options object. Outside a request it calls through
const runtimeFor = cache(async (asVisitor: boolean) => {
  const payloadConfig = await configPromise;
  return getPayloadRuntime(payloadConfig, { asVisitor });
});

/**
 * Get an authenticated Payload instance for server-side operations,
 * along with tenant runtime config if available.
 *
 * The Payload instance is authenticated using the API key defined in environment
 * variables. Shared by every caller in the same request.
 *
 * @returns The Payload instance with authenticated user property and tenant config if available.
 */
export const payloadRuntime = ({
  asVisitor = false
}: AuthenticatedPayloadOptions = {}) => runtimeFor(asVisitor);
