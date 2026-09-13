import {
  type HumanCheckFields,
  clientIp,
  rateLimit
} from '@codeware/shared/util/human-check';
import { post } from '@codeware/shared/util/payload-api';
import { json } from '@remix-run/node';

import env from '../../env-resolver/env';
import { getPayloadRequestOptions } from '../utils/get-payload-request-options';
import type { TypedActionFunctionArgs } from '../utils/types';

type Body = {
  humanCheck?: HumanCheckFields;
  tour?: number;
  name?: string;
  email?: string;
  phone?: string;
  people?: number;
  acceptedTerms?: boolean;
};

/**
 * Handle tour signups against the Payload REST API.
 *
 * Runs server-side so the tenant api key never reaches the browser, exactly
 * like the form submission route. The response carries the status the server
 * decided from capacity — booked, or on the waiting list.
 */
export async function action({ context, request }: TypedActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, { status: 405 });
  }
  if (request.headers.get('Content-Type') !== 'application/json') {
    return json(
      { message: 'Invalid content type, expecting "application/json"' },
      { status: 415 }
    );
  }

  const body = (await request.json()) as Body;

  if (!body?.tour || !body?.name || !body?.email || !body?.people) {
    return json({ message: 'Invalid tour signup body' }, { status: 400 });
  }

  const { acceptedTerms, humanCheck, ...signup } = body;

  // Counted here as well, so a flood is refused before it costs a second hop.
  // The proof itself is checked by the cms route this forwards to — spending
  // the Turnstile token here would make that check refuse a replay
  const allowance = rateLimit(
    `tour-signup:${clientIp(request.headers) ?? 'unknown'}`,
    { limit: env.HUMAN_CHECK_RATE_LIMIT }
  );

  if (!allowance.ok) {
    return json(
      { message: 'Too many submissions' },
      {
        status: 429,
        headers: { 'Retry-After': String(allowance.retryAfterSeconds) }
      }
    );
  }

  const requestOptions = getPayloadRequestOptions(
    'POST',
    context,
    request.headers,
    {
      ...signup,
      humanCheck,
      acceptedTerms,
      // Timed here rather than from anything the browser sent — a record of
      // acceptance is only worth keeping if a server wrote it
      termsAcceptedAt: acceptedTerms ? new Date().toISOString() : null
    }
  );

  try {
    const response = await post('tour-signups', requestOptions);
    const doc = (response as { doc?: { id?: number; status?: string } })?.doc;

    // The status decides what the customer is told — booked, or queued. A
    // response without one is not a success to report: answering `success`
    // with an undefined status would confirm a place that may not exist.
    if (!doc?.id || !doc.status) {
      return json(
        { success: false, message: 'Unexpected signup response' },
        { status: 502 }
      );
    }

    return json({
      success: true,
      id: doc.id,
      status: doc.status
    });
  } catch (e) {
    const error = e as Error & { status?: number; retryAfter?: string };

    // A refused rate upstream stays a refused rate here, retry hint and all
    const status = error.status === 429 ? 429 : 400;

    return json(
      { success: false, message: error?.message ?? 'Unknown error' },
      {
        status,
        headers: error.retryAfter ? { 'Retry-After': error.retryAfter } : {}
      }
    );
  }
}

// Add a loader to handle GET requests if needed
export async function loader() {
  return json(
    { message: 'This endpoint only accepts POST requests' },
    { status: 405 }
  );
}
