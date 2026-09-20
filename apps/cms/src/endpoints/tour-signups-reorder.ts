import { getTourSignups, mapToRuntime } from '@codeware/app-cms/data-access';
import { SKIP_QUEUE_RENUMBER } from '@codeware/app-cms/util/tour-signups';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

import { mayEditActiveTenant } from '../security/may-edit-active-tenant';

/** Upper bound on a single reorder, matching the panel's own load cap */
const MAX_IDS = 500;

/** Coerce the posted ids to the numeric document ids this deployment uses */
function parseIds(value: unknown): Array<number> {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = value
    .map((id) => (typeof id === 'number' ? id : Number(id)))
    .filter((id) => Number.isInteger(id) && id > 0);

  return [...new Set(ids)].slice(0, MAX_IDS);
}

/**
 * Rewrite the order of a tour's waiting list.
 *
 * The queue is the guide's to arrange — a customer who called twice may be
 * offered the next place ahead of someone who signed up earlier — so position
 * is stored rather than derived from arrival time.
 *
 * Authorization mirrors the read-marker endpoint: the caller must be an admin
 * user, and only ids that come back from a *read* under their own access and
 * workspace scope are written. Ids for another tour, another workspace, or a
 * status other than `waiting` are dropped rather than reordered.
 */
export const tourSignupsReorderEndpoint: Endpoint = {
  path: '/tour-signups-reorder',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!(await mayEditActiveTenant(req))) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as { ids?: unknown; tour?: unknown };
    const ids = parseIds(body.ids);
    const tour = Number(body.tour);

    if (!Number.isInteger(tour) || tour < 1 || !ids.length) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.BAD_REQUEST) },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    // A reorder is one decision, so it lands whole or not at all. Without a
    // transaction each write commits on its own, and a failure halfway leaves
    // the queue in an order nobody chose — the loop below only produces a
    // complete 1..n sequence if every write survives.
    const transactionID =
      (await req.payload.db.beginTransaction()) ?? undefined;

    if (transactionID) {
      req.transactionID = transactionID;
    }

    try {
      const runtime = mapToRuntime(req.payload, req.user);

      // Reading under the caller's own access is what authorizes the writes
      const readable = await getTourSignups(runtime, {
        where: {
          and: [
            { id: { in: ids } },
            { tour: { equals: tour } },
            { status: { equals: 'waiting' } }
          ]
        },
        limit: ids.length
      });

      const allowed = new Set((readable?.docs ?? []).map((doc) => doc.id));

      // Positions follow the order the client sent, skipping anything it was
      // not allowed to move, so the surviving rows keep their relative order
      const ordered = ids.filter((id) => allowed.has(id));

      for (const [index, id] of ordered.entries()) {
        await req.payload.update({
          collection: 'tour-signups',
          id,
          data: { queuePosition: index + 1 },
          depth: 0,
          // The renumber hook would re-sort the queue between these writes and
          // undo the drag: mid-loop two rows briefly share a position, and the
          // tie breaks on arrival time — the order the guide just set. The
          // loop writes a complete 1..n order itself, so there is nothing left
          // to renumber.
          context: { [SKIP_QUEUE_RENUMBER]: true },
          overrideAccess: true,
          req
        });
      }

      if (transactionID) {
        await req.payload.db.commitTransaction(transactionID);
      }

      return Response.json(
        { updated: ordered },
        {
          status: StatusCodes.OK,
          headers: headersWithCors({ headers: new Headers(), req })
        }
      );
    } catch (error) {
      if (transactionID) {
        await req.payload.db.rollbackTransaction(transactionID);
      }

      req.payload.logger.error(
        `[tourSignupsReorder] Update failed: ${String(error)}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};
