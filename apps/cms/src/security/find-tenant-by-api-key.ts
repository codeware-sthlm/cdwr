import type { Tenant } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

import { apiKeyIndexWhere } from './api-key-index';

/**
 * Resolves a tenant from its API key through the HMAC index, the same lookup
 * Payload's API-key strategy uses.
 *
 * Access control calls this per collection per operation, which made a single
 * admin render resolve the same tenant hundreds of times. The identity is
 * pinned by the deployment's API key, so it only needs re-reading often enough
 * to pick up an edited tenant doc.
 */
const CACHE_TTL_MS = 10_000;

const cache = new Map<
  string,
  { at: number; promise: Promise<Tenant | undefined> }
>();

export const findTenantByApiKey = (
  payload: Payload,
  apiKey: string
): Promise<Tenant | undefined> => {
  const cached = cache.get(apiKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = payload
    .find({
      collection: 'tenants',
      overrideAccess: true,
      pagination: false,
      limit: 1,
      where: apiKeyIndexWhere(payload.secret, apiKey),
      // Callers only need `id`, so skip relationship population on what is an
      // access-control hot path
      depth: 0
    })
    .then(({ docs }) => docs[0])
    .catch((error) => {
      // Never cache a failed lookup — the next call should retry
      cache.delete(apiKey);
      throw error;
    });

  cache.set(apiKey, { at: Date.now(), promise });
  return promise;
};
