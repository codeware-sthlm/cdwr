import { resetTotp } from '@codeware/app-cms/data-access';
import { StatusCodes } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { authorizeTotpAdminAction, fail } from './authorize-totp-admin-action';

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
    const { payload } = req;

    try {
      const authorized = await authorizeTotpAdminAction(req);
      if (authorized instanceof Response) {
        return authorized;
      }
      const { requester, id, target } = authorized;

      await resetTotp(payload, { id });
      payload.logger.info(
        `[totpReset] user ${target?.id} ${target?.email} reset by ${requester.id} ${requester.email}`
      );
      return Response.json({ reset: true });
    } catch (error) {
      payload.logger.error(
        { err: error },
        `[totpReset] The reset of user ${req.routeParams?.['id']} failed unexpectedly`
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
