import { forgetTotpTrust } from '@codeware/app-cms/data-access';
import { canResetTotp } from '@codeware/app-cms/util/access';
import { getUserTenantIDs, hasRole, isUser } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

const fail = (status: StatusCodes) =>
  Response.json({ error: getReasonPhrase(status) }, { status });

/**
 * Ends every trusted device of a user, so the next sign-in on each asks for
 * the code again.
 *
 * Anyone may do it for their own account; for another user it takes
 * `canResetTotp`, the rule that decides who may reset whom. The write
 * overrides access, since the trust epoch is writable by nobody. A session
 * that still owes the second factor is refused by `secondFactorEndpoint`,
 * which the `payload-totp` plugin wraps around every custom endpoint.
 */
export const userTotpTrustForgetEndpoint: Endpoint = {
  path: '/:id/totp-trust-forget',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const { payload, user } = req;
    const requester = user ?? null;

    if (!isUser(requester)) {
      return fail(StatusCodes.FORBIDDEN);
    }

    const id = Number(req.routeParams?.['id']);
    if (!Number.isInteger(id)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    try {
      if (id !== requester.id) {
        // Only someone who may reset anybody gets to learn whether the user exists
        if (
          !hasRole(requester, 'system-user') &&
          !getUserTenantIDs(requester, 'admin').length
        ) {
          return fail(StatusCodes.FORBIDDEN);
        }
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
      }

      await forgetTotpTrust(payload, { id });
      payload.logger.info(
        `[totpTrustForget] devices of user ${id} forgotten by ${requester.id} ${requester.email}`
      );
      return Response.json({ forgotten: true });
    } catch (error) {
      payload.logger.error(
        { err: error },
        `[totpTrustForget] Forgetting the devices of user ${id} failed unexpectedly`
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
