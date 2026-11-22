import { forgetTotpTrust } from '@codeware/app-cms/data-access';
import { StatusCodes } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { authorizeTotpAdminAction, fail } from './authorize-totp-admin-action';

/**
 * Ends every trusted device of a user, this browser included: each asks for
 * the code again at its next request.
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
    const { payload } = req;

    try {
      const authorized = await authorizeTotpAdminAction(req, {
        allowSelf: true
      });
      if (authorized instanceof Response) {
        return authorized;
      }
      const { requester, id } = authorized;

      await forgetTotpTrust(payload, { id });
      payload.logger.info(
        `[totpTrustForget] devices of user ${id} forgotten by ${requester.id} ${requester.email}`
      );
      return Response.json({ forgotten: true });
    } catch (error) {
      payload.logger.error(
        { err: error },
        `[totpTrustForget] Forgetting the devices of user ${req.routeParams?.['id']} failed unexpectedly`
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
