import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { getId, isAgent } from '@codeware/app-cms/util/misc';
import type { Agent, Tenant } from '@codeware/shared/util/payload-types';
import type { Access, AccessArgs, AccessResult, PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../../../security/resolve-scoped-tenant';
import { verifyHostSignature } from '../../../security/verify-host-signature';

/** The agent's own workspace id */
export const agentTenantId = (agent: Agent) => getId<Tenant>(agent.tenant);

/**
 * Whether an agent may act on this deployment at all.
 *
 * Tenant mode serves one workspace, which must be the agent's own. Host mode
 * serves them all, so an external request must be signed, the same way a
 * workspace api key's is.
 */
const agentMayActHere = async (
  req: PayloadRequest,
  agent: Agent
): Promise<boolean> => {
  const { APP_MODE } = getEnv();

  if (APP_MODE.type === 'tenant') {
    const tenant = await resolveScopedTenant(req.payload);
    return Boolean(tenant) && tenant?.id === agentTenantId(agent);
  }

  return verifyHostSignature(req, `Agent ${agent.id}`);
};

/**
 * Grant an agent what `forAgent` returns, and leave every other identity to
 * `access`, unchanged.
 *
 * An agent is refused outright where it may not act (see `agentMayActHere`).
 */
export const agentOr =
  (
    access: Access,
    forAgent: (agent: Agent, args: AccessArgs) => AccessResult
  ): Access =>
  async (args) => {
    const { user } = args.req;

    if (!isAgent(user)) {
      return access(args);
    }

    if (!(await agentMayActHere(args.req, user))) {
      return false;
    }

    return forAgent(user, args);
  };

/**
 * An agent may create a post. Payload ignores a query constraint on create, so
 * the workspace and the draft status are set by `agentDraftOnly`.
 */
export const agentMayCreate = (): AccessResult => true;

/**
 * An agent reads the posts it drafted, in its own workspace, drafts included.
 *
 * @param path - Where the document sits: `version` for version documents
 */
export const agentDraftsWhere =
  (path: 'doc' | 'version' = 'doc') =>
  (agent: Agent): AccessResult => {
    const prefix = path === 'version' ? 'version.' : '';

    return {
      and: [
        { [`${prefix}tenant`]: { equals: agentTenantId(agent) } },
        { [`${prefix}draftedBy`]: { equals: agent.id } }
      ]
    };
  };
