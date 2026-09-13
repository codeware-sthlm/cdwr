import { randomUUID } from 'node:crypto';

import type { CollectionBeforeOperationHook } from 'payload';

/**
 * Give a workspace an API key when it is created without one.
 *
 * A workspace authenticates by its key, so one without it cannot be used.
 * This runs before the operation rather than in `beforeChange`: Payload
 * derives the index a key is looked up by from `data.apiKey` in a field hook
 * that runs before the collection's own hooks, so a key set any later would be
 * stored without it and never authenticate. A UUID, like the key the admin
 * generates.
 */
export const generateApiKeyHook: CollectionBeforeOperationHook<'tenants'> = ({
  args,
  operation
}) => {
  if (operation !== 'create') {
    return args;
  }

  const { data } = args;

  if (data && !data.apiKey) {
    data.apiKey = randomUUID();
    data.enableAPIKey = true;
  }

  return args;
};
