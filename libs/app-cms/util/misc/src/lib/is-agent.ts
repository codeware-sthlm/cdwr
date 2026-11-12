import type { Agent, UserAny } from '@codeware/shared/util/payload-types';
import type { TypeWithID } from 'payload';

/**
 * Check if the user is an agent, the api key identity that drafts posts.
 * Resolve the proper agent type.
 *
 * @param user - The user to check.
 * @returns `true` if the user is from the agents collection, `false` otherwise.
 */
export const isAgent = <T extends TypeWithID = UserAny>(
  user: T | Agent | null | undefined
): user is Agent => {
  if (!user) {
    return false;
  }
  // Not `apiKey`: Payload strips it from every document it returns, req.user included
  return 'collection' in user && user.collection === 'agents';
};
