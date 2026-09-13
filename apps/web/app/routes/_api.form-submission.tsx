import { guardHeaders, guardSubmit } from '@codeware/shared/util/human-check';
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

  // Get the body from the request. The proof of a person is pulled out here —
  // it belongs to this request, not to the stored submission
  const { humanCheck, ...body } = (await request.json()) as FormSubmission & {
    humanCheck?: { token?: unknown; honeypot?: unknown; drawnAt?: unknown };
  };

  if (!body?.form || !(body?.submissionData ?? []).length) {
    return json({ message: 'Invalid form submission body' }, { status: 400 });
  }

  const guard = await guardSubmit({
    fields: humanCheck ?? {},
    headers: request.headers,
    scope: 'form-submission',
    secretKey: env.TURNSTILE_SECRET_KEY
  });

  if (!guard.ok) {
    return json(
      { message: guard.message },
      { status: guard.status, headers: guardHeaders(guard) }
    );
  }

  // Create request options with authentication
  const requestOptions = getPayloadRequestOptions(
    'POST',
    context,
    request.headers,
    body
  );

  console.log('Send form submission request', requestOptions);

  try {
    const response = await post('form-submissions', requestOptions);
    return json({ success: true, data: response });
  } catch (e) {
    const error = e as Error;
    return json(
      { success: false, data: { error: error?.message ?? 'Unknown error' } },
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
