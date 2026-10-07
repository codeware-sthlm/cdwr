import { createHmac } from 'node:crypto';

import type { Where } from 'payload';

/**
 * Matches an auth document by its API key the way Payload's own API-key
 * strategy does: through the HMAC index, since the key itself is encrypted at
 * rest and stripped from every read. SHA-1 covers keys saved before 3.46.
 */
export const apiKeyIndexWhere = (secret: string, apiKey: string): Where => ({
  or: (['sha256', 'sha1'] as const).map((algorithm) => ({
    apiKeyIndex: {
      equals: createHmac(algorithm, secret).update(apiKey).digest('hex')
    }
  }))
});
