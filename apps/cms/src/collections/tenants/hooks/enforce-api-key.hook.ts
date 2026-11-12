import type { Agent, Tenant } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeChangeHook } from 'payload';

/**
 * Before change hook.
 *
 * Ensure that the API key is enabled for the workspace or agent.
 *
 * @param data The data to populate
 * @returns The data with the `enableAPIKey` field set to true
 */
export const enforceApiKeyHook: CollectionBeforeChangeHook<Tenant | Agent> = ({
  data
}) => {
  return {
    ...data,
    enableAPIKey: true
  };
};
