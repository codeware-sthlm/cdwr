import { getTours, mapToRuntime } from '@codeware/app-cms/data-access';
import { canEdit } from '@codeware/app-cms/util/misc';
import { anonymizeTourSignups } from '@codeware/app-cms/util/tour-signups';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

/**
 * Clear the passenger data on one tour, on request.
 *
 * The guide's own control over personal data, alongside the nightly retention
 * sweep: once the tour is home there is rarely a reason to keep a stranger's
 * phone number until the retention period comes round.
 *
 * Authorization mirrors the other signup endpoints: the caller must be an
 * admin user, and the tour has to come back from a *read* under their own
 * access and workspace scope before anything is written.
 */
export const tourSignupsAnonymizeEndpoint: Endpoint = {
  path: '/tour-signups-anonymize',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!canEdit(req.user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    await addDataAndFileToRequest(req);
    const tour = Number((req.data ?? {})['tour']);

    if (!Number.isInteger(tour) || tour < 1) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.BAD_REQUEST) },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    try {
      const runtime = mapToRuntime(req.payload, req.user);
      const readable = await getTours(runtime, {
        where: { id: { equals: tour } },
        limit: 1
      });

      if (!readable?.docs.length) {
        return Response.json(
          { error: getReasonPhrase(StatusCodes.NOT_FOUND) },
          { status: StatusCodes.NOT_FOUND }
        );
      }

      const cleared = await anonymizeTourSignups(req.payload, tour, req);

      return Response.json(
        { cleared: cleared.length },
        {
          status: StatusCodes.OK,
          headers: headersWithCors({ headers: new Headers(), req })
        }
      );
    } catch (error) {
      req.payload.logger.error(
        `[tourSignupsAnonymize] Update failed: ${String(error)}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};
