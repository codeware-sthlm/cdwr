import { isAgent } from '@codeware/app-cms/util/misc';
import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook
} from 'payload';

import { agentTenantId } from '../access/agent-post-access';

const refuse = (reason: string) =>
  new APIError(`An agent ${reason}. It can only create drafts.`, 403);

/**
 * An agent creates drafts in its own workspace, and nothing else.
 *
 * Runs before the operation, on the request's own arguments, so it sees the
 * body before field access strips anything. It refuses what would publish or
 * hand the post to a site definition, then stamps the draft status, the
 * agent's workspace and `draftedBy`. The fields' own access lets those three
 * through for an agent and for nobody else.
 *
 * Every other operation is closed to an agent by the collection's access.
 */
export const agentDraftOnly: CollectionBeforeOperationHook<'posts'> = ({
  args,
  operation,
  req: { user }
}) => {
  if (operation !== 'create' || !isAgent(user)) {
    return args;
  }

  const data = (args.data ?? {}) as Record<string, unknown>;

  if (data['_status'] === 'published') {
    throw refuse('cannot publish a post');
  }
  if (args.publishSpecificLocale || args.publishAllLocales) {
    throw refuse('cannot publish a locale');
  }
  if (args.duplicateFromID !== undefined && args.duplicateFromID !== null) {
    throw refuse('cannot duplicate a post');
  }
  if (data['managedBy']) {
    throw refuse('cannot set managedBy');
  }

  const tenant = agentTenantId(user);
  const requested = data['tenant'];
  const requestedId =
    requested && typeof requested === 'object' && 'id' in requested
      ? requested.id
      : requested;

  if (
    requestedId !== undefined &&
    requestedId !== null &&
    requestedId !== tenant
  ) {
    throw refuse('cannot write to another workspace');
  }

  args.draft = true;
  args.data = {
    ...data,
    _status: 'draft',
    draftedBy: user.id,
    tenant
  } as typeof args.data;

  return args;
};

/**
 * The last word before the post is written: whatever an earlier step did, an
 * agent's post is a draft.
 */
export const agentNeverPublishes: CollectionBeforeChangeHook = ({
  data,
  req: { user }
}) => {
  if (isAgent(user) && data['_status'] !== 'draft') {
    throw refuse('cannot publish a post');
  }

  return data;
};
