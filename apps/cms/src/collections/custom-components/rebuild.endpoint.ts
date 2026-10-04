import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest, Where } from 'payload';

import { componentDeveloperAccess } from '../../security/component-developer-access';

const fail = (status: StatusCodes) =>
  Response.json({ error: getReasonPhrase(status) }, { status });

/**
 * Sets a component back to pending, which queues and starts its build. The
 * way to retry a failed build without changing the source.
 *
 * The collection's update access decides who may, asked here rather than
 * through the update itself: the `build` group is never writable through
 * access, so the write has to override it once the account is allowed.
 */
export const customComponentRebuildEndpoint: Endpoint = {
  path: '/:id/rebuild',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const id = Number(req.routeParams?.['id']);
    if (!Number.isInteger(id)) {
      return fail(StatusCodes.NOT_FOUND);
    }

    const allowed = await componentDeveloperAccess('update')({ req });
    if (!allowed) {
      return fail(StatusCodes.FORBIDDEN);
    }
    const where: Where = {
      and: [{ id: { equals: id } }, ...(allowed === true ? [] : [allowed])]
    };

    try {
      const { payload } = req;
      const permitted = await payload.find({
        collection: 'custom-components',
        where,
        depth: 0,
        limit: 1,
        select: { slug: true },
        overrideAccess: true
      });
      if (permitted.totalDocs === 0) {
        const exists = await payload.count({
          collection: 'custom-components',
          where: { id: { equals: id } },
          overrideAccess: true
        });
        return fail(
          exists.totalDocs ? StatusCodes.FORBIDDEN : StatusCodes.NOT_FOUND
        );
      }

      await payload.update({
        collection: 'custom-components',
        id,
        data: { build: { status: 'pending' } },
        user: req.user,
        overrideAccess: true,
        req
      });
      return Response.json({ status: 'pending' });
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        '[customComponents] The rebuild failed unexpectedly'
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
