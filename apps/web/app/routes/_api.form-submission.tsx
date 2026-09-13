import {
  type HumanCheckFields,
  clientIp,
  rateLimit
} from '@codeware/shared/util/human-check';
import { post } from '@codeware/shared/util/payload-api';
import type { FormSubmission } from '@codeware/shared/util/payload-types';
import { json } from '@remix-run/node';

import env from '../../env-resolver/env';
import { getPayloadRequestOptions } from '../utils/get-payload-request-options';
import type { TypedActionFunctionArgs } from '../utils/types';

/**
 * Handle form submission requests to the Payload REST API.
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

  // Kept whole, proof and all: this app forwards to the cms, whose own
  // `/api/form-submissions` route is where the check runs. Verifying here too
  // would spend the Turnstile token, and the cms would then refuse the same
  // submission for replaying it
  const body = (await request.json()) as FormSubmission & {
    humanCheck?: HumanCheckFields;
  };

  if (!body?.form || !(body?.submissionData ?? []).length) {
    return json({ message: 'Invalid form submission body' }, { status: 400 });
  }

  // Counted here as well, so a flood is refused before it costs a second hop
  const allowance = rateLimit(
    `form-submission:${clientIp(request.headers) ?? 'unknown'}`,
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

  // Create request options with authentication
  const requestOptions = getPayloadRequestOptions(
    'POST',
    context,
    request.headers,
    body
  );

  try {
    const response = await post('form-submissions', requestOptions);
    return json({ success: true, data: response });
  } catch (e) {
    const error = e as Error & { status?: number; retryAfter?: string };

    // A refused rate upstream stays a refused rate here, retry hint and all
    const status = error.status === 429 ? 429 : 400;

    return json(
      { success: false, data: { error: error?.message ?? 'Unknown error' } },
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
