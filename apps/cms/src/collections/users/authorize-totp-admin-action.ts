import { canResetTotp } from '@codeware/app-cms/util/access';
import { getUserTenantIDs, hasRole, isUser } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { PayloadRequest } from 'payload';

export const fail = (status: StatusCodes) =>
  Response.json({ error: getReasonPhrase(status) }, { status });

type Authorized = {
  requester: User;
  id: number;
  /** `null` for the requester's own account, when `allowSelf` is set */
  target: Pick<User, 'id' | 'email' | 'role' | 'tenants'> | null;
};

/**
 * Whether the requester may act on another user's two-factor setup, for the
 * endpoints that do: the user from `:id`, or a `Response` that refuses.
 *
 * `canResetTotp` decides who may act on whom. Only someone who may reset
 * anybody gets to learn whether a user exists. With `allowSelf` the
 * requester's own account passes without a lookup.
 */
export const authorizeTotpAdminAction = async (
  req: PayloadRequest,
  { allowSelf = false }: { allowSelf?: boolean } = {}
): Promise<Authorized | Response> => {
  const requester = req.user ?? null;
  if (!isUser(requester)) {
    return fail(StatusCodes.FORBIDDEN);
  }
  const mayActOnAnybody =
    hasRole(requester, 'system-user') ||
    getUserTenantIDs(requester, 'admin').length > 0;

  if (!allowSelf && !mayActOnAnybody) {
    return fail(StatusCodes.FORBIDDEN);
  }
  const id = Number(req.routeParams?.['id']);
  if (!Number.isInteger(id)) {
    return fail(StatusCodes.NOT_FOUND);
  }
  if (allowSelf && id === requester.id) {
    return { requester, id, target: null };
  }
  if (!mayActOnAnybody) {
    return fail(StatusCodes.FORBIDDEN);
  }

  const target = await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    select: { email: true, role: true, tenants: true },
    overrideAccess: true,
    disableErrors: true
  });
  if (!target) {
    return fail(StatusCodes.NOT_FOUND);
  }
  if (!canResetTotp(requester, target)) {
    return fail(StatusCodes.FORBIDDEN);
  }
  return { requester, id, target };
};
