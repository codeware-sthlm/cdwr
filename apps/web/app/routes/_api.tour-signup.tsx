import {
  clientIp,
  rateLimit,
  verifyHuman
} from '@codeware/shared/util/human-check';
import { post } from '@codeware/shared/util/payload-api';
import { json } from '@remix-run/node';

import env from '../../env-resolver/env';
import { getPayloadRequestOptions } from '../utils/get-payload-request-options';
import type { TypedActionFunctionArgs } from '../utils/types';

type Body = {
  humanCheck?: { token?: unknown; honeypot?: unknown; drawnAt?: unknown };
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

  const ip = clientIp(request.headers);

  // Counted before anything expensive happens
  const allowance = rateLimit(`tour-signup:${ip ?? 'unknown'}`);

  if (!allowance.ok) {
    return json(
      { message: 'Too many submissions' },
      {
        status: 429,
        headers: { 'Retry-After': String(allowance.retryAfterSeconds) }
      }
    );
  }

  const check = await verifyHuman(humanCheck ?? {}, {
    secretKey: env.TURNSTILE_SECRET_KEY,
    ip
  });

  if (!check.ok) {
    // Logged with its reason, answered without one
    console.warn(`Tour signup refused: ${check.reason}`);
    return json(
      { message: 'Could not accept this submission' },
      { status: 400 }
    );
  }

  const requestOptions = getPayloadRequestOptions(
    'POST',
    context,
    request.headers,
    {
      ...signup,
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
    const error = e as Error;
    return json(
      { success: false, message: error?.message ?? 'Unknown error' },
      { status: 400 }
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
