import { isAgent } from '@codeware/app-cms/util/misc';
import { APIError, type CollectionBeforeOperationHook } from 'payload';

import { agentTenantId } from '../access/agent-post-access';

/**
 * An agent files its draft only under categories of its own workspace.
 *
 * The relationship checks an id's type, not whose it is, and an agent counts
 * as having access to all tenants in the multi-tenant plugin, so nothing else
 * keeps another workspace's category off an agent's draft.
 */
export const agentOwnCategories: CollectionBeforeOperationHook<
  'posts'
> = async ({ args, operation, req }) => {
  const { user, payload } = req;
  if (operation !== 'create' || !isAgent(user)) {
    return args;
  }

  const categories = (args.data as Record<string, unknown> | undefined)?.[
    'categories'
  ];
  if (categories === undefined || categories === null) {
    return args;
  }
  if (!Array.isArray(categories)) {
    throw new APIError('An agent sends categories as a list of ids.', 400);
  }

  const ids = [
    ...new Set(
      categories.map((category: unknown) =>
        category && typeof category === 'object' && 'id' in category
          ? category.id
          : category
      )
    )
  ];
  if (!ids.length) {
    return args;
  }

  const { totalDocs } = await payload.count({
    collection: 'categories',
    where: {
      and: [{ id: { in: ids } }, { tenant: { equals: agentTenantId(user) } }]
    },
    overrideAccess: true,
    req
  });
  if (totalDocs !== ids.length) {
    throw new APIError(
      'An agent can only use categories of its own workspace.',
      403
    );
  }

  return args;
};
