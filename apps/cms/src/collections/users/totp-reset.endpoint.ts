import { resetTotp } from '@codeware/app-cms/data-access';
import { canResetTotp } from '@codeware/app-cms/util/access';
import { getUserTenantIDs, hasRole, isUser } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

const fail = (status: StatusCodes) =>
  Response.json({ error: getReasonPhrase(status) }, { status });

/**
 * Resets a user's two-factor login for someone who lost their authenticator
 * entry: clears the secret and ends every session, so the next sign-in asks
 * them to enrol again. `payload-totp`'s own remove asks for a code, which
 * such a user doesn't have.
 *
 * `canResetTotp` decides who may reset whom. The write overrides access,
 * since the secret is writable by nobody.
 */
export const userTotpResetEndpoint: Endpoint = {
  path: '/:id/totp-reset',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const { payload, user } = req;
    const requester = user ?? null;

    // Only someone who may reset anybody gets to learn whether the user exists
    if (
      !isUser(requester) ||
      (!hasRole(requester, 'system-user') &&
        !getUserTenantIDs(requester, 'admin').length)
    ) {
      return fail(StatusCodes.FORBIDDEN);
    }

    const id = Number(req.routeParams?.['id']);
    if (!Number.isInteger(id)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    try {
      const target = await payload.findByID({
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

      await resetTotp(payload, { id });
      payload.logger.info(
        `[totpReset] user ${target.id} ${target.email} reset by ${requester.id} ${requester.email}`
      );
      return Response.json({ reset: true });
    } catch (error) {
      payload.logger.error(
        { err: error },
        `[totpReset] The reset of user ${id} failed unexpectedly`
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
