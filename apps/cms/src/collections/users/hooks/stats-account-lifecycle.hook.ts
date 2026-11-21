import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { getUmamiAdminApi } from '@codeware/app-cms/feature/site-stats';
import { getId } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  PayloadRequest
} from 'payload';

/**
 * Request context key that carries the deleted user's Umami id to `afterDelete`.
 * Keyed by user, since a bulk delete runs several users through one request.
 */
const deletedUmamiUserKey = (id: number | string) =>
  `statsAccountUmamiUserId:${id}`;

/** The workspaces the user administers */
const adminTenantIds = (user: Pick<User, 'tenants'> | undefined) =>
  new Set(
    (user?.tenants ?? [])
      .filter(({ role }) => role === 'admin')
      .map(({ tenant }) => getId(tenant))
  );

/** The user's Umami id; the group is hidden from most readers, so it is read past access */
const umamiUserIdOf = async (
  req: PayloadRequest,
  id: number
): Promise<string | undefined> => {
  const stored = await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    select: { statsAccount: true },
    overrideAccess: true,
    disableErrors: true,
    req
  });
  return stored?.statsAccount?.umamiUserId ?? undefined;
};

/**
 * Takes a user out of a workspace's statistics team when they stop being an
 * admin there, or leave it. Best effort: a failure is logged, never thrown,
 * and `cdwr tenant stats-accounts --prune` finds what was missed.
 */
export const removeStatsTeamMembershipHook: CollectionAfterChangeHook<
  User
> = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update') {
    return doc;
  }

  const before = adminTenantIds(previousDoc);
  const after = adminTenantIds(doc);
  const lost = [...before].filter((id) => !after.has(id));
  if (!lost.length) {
    return doc;
  }

  try {
    const admin = await getUmamiAdminApi(getEnv().UMAMI_URL);
    if (admin.status !== 'ready') {
      return doc;
    }
    const umamiUserId = await umamiUserIdOf(req, doc.id);
    if (!umamiUserId) {
      return doc;
    }

    for (const tenantId of lost) {
      try {
        const tenant = await req.payload.findByID({
          collection: 'tenants',
          id: tenantId,
          depth: 0,
          select: { statsTeamId: true },
          overrideAccess: true,
          disableErrors: true,
          req
        });
        if (!tenant?.statsTeamId) {
          continue;
        }
        await admin.umami.removeTeamUser(tenant.statsTeamId, umamiUserId);
        req.payload.logger.info(
          `stats account removed from team: user ${umamiUserId} tenant ${tenantId}`
        );
      } catch (error) {
        req.payload.logger.error(
          `stats account team removal failed: user ${umamiUserId} tenant ${tenantId}: ${String(error)}`
        );
      }
    }
  } catch (error) {
    req.payload.logger.error(
      `stats account team removal failed: user ${doc.id}: ${String(error)}`
    );
  }

  return doc;
};

/**
 * Remembers the user's Umami id before the delete, since the document that
 * `afterDelete` receives has been read under the caller's field access.
 */
export const rememberStatsAccountHook: CollectionBeforeDeleteHook = async ({
  id,
  req
}) => {
  try {
    const umamiUserId = await umamiUserIdOf(req, Number(id));
    if (umamiUserId) {
      req.context[deletedUmamiUserKey(id)] = umamiUserId;
    }
  } catch (error) {
    req.payload.logger.error(
      `stats account lookup failed: user ${String(id)}: ${String(error)}`
    );
  }
};

/** Deletes the deleted user's Umami account. Best effort, like the removal above */
export const deleteStatsAccountHook: CollectionAfterDeleteHook<User> = async ({
  doc,
  id,
  req
}) => {
  const key = deletedUmamiUserKey(id);
  const umamiUserId = req.context[key];
  delete req.context[key];
  if (typeof umamiUserId !== 'string') {
    return doc;
  }

  try {
    const admin = await getUmamiAdminApi(getEnv().UMAMI_URL);
    if (admin.status !== 'ready') {
      return doc;
    }
    await admin.umami.deleteUser(umamiUserId);
    req.payload.logger.info(`stats account deleted: user ${umamiUserId}`);
  } catch (error) {
    req.payload.logger.error(
      `stats account deletion failed: user ${umamiUserId}: ${String(error)}`
    );
  }

  return doc;
};
