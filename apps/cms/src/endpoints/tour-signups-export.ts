import {
  getTourSignups,
  getTours,
  mapToRuntime
} from '@codeware/app-cms/data-access';
import { canEdit } from '@codeware/app-cms/util/misc';
import { CSV_BOM, csvRow, toFileSlug } from '@codeware/shared/util/pure';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

/**
 * Cap on exported rows. A tour with more signups than this is refused rather
 * than truncated — a passenger list quietly missing people is worse than no
 * list, because nothing about the file says who is absent.
 */
const MAX_ROWS = 5000;

/** Fixed columns, unlike a form export: the shape is the platform's own */
const columns = [
  'Name',
  'Party size',
  'Status',
  'Queue position',
  'Email',
  'Phone',
  'Signed up',
  'Notes'
] as const;

/**
 * Export one tour's signups as the passenger list.
 *
 * This is the file a guide takes with them: names, party sizes and phone
 * numbers, in the order people signed up. Cancelled signups are included and
 * labelled rather than dropped — a guide reading the list at the airport needs
 * to know that someone they expected is not coming.
 *
 * Reads run under the caller's own access control and workspace scope, so an
 * editor can only export a tour they can already open.
 */
export const tourSignupsExportEndpoint: Endpoint = {
  path: '/tour-signups-export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!canEdit(req.user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    const tourId = Number(req.query?.['tour']);

    if (!Number.isInteger(tourId) || tourId < 1) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.BAD_REQUEST) },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    try {
      const runtime = mapToRuntime(req.payload, req.user);

      // Reading the tour under the caller's own access is what authorizes the
      // export — an id from the query string proves nothing on its own
      const tours = await getTours(runtime, {
        where: { id: { equals: tourId } },
        limit: 1
      });
      const tour = tours?.docs[0];

      if (!tour) {
        return Response.json(
          { error: getReasonPhrase(StatusCodes.NOT_FOUND) },
          { status: StatusCodes.NOT_FOUND }
        );
      }

      const signups = await getTourSignups(runtime, {
        where: { tour: { equals: tourId } },
        limit: MAX_ROWS
      });

      if ((signups?.totalDocs ?? 0) > MAX_ROWS) {
        return Response.json(
          {
            error: `This tour has ${signups?.totalDocs} signups, more than the ${MAX_ROWS} this export can return.`
          },
          { status: StatusCodes.REQUEST_TOO_LONG }
        );
      }

      const rows = (signups?.docs ?? []).map((signup) =>
        csvRow([
          signup.name,
          String(signup.people),
          signup.status,
          signup.queuePosition ? String(signup.queuePosition) : '',
          signup.email,
          signup.phone ?? '',
          signup.createdAt,
          signup.notes ?? ''
        ])
      );

      const csv = [csvRow([...columns]), ...rows].join('\r\n');

      // The id keeps the name unique: `toFileSlug` drops non-ASCII, so two
      // tours with different titles can slug to the same string
      const filename = `${toFileSlug(tour.title, 'tour')}-${tour.id}-passengers-${new Date().toISOString().slice(0, 10)}.csv`;

      return new Response(`${CSV_BOM}${csv}`, {
        status: StatusCodes.OK,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      req.payload.logger.error(
        `[tourSignupsExport] Export failed: ${String(error)}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};
