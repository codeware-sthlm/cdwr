import { createFormSubmission } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  clientIp,
  rateLimit,
  verifyHuman
} from '@codeware/shared/util/human-check';
import type { FormSubmission } from '@codeware/shared/util/payload-types';
import { NextRequest, NextResponse } from 'next/server';

import { payloadRuntime } from '../../../security/payload-runtime';

type Body = FormSubmission & {
  humanCheck?: { token?: unknown; honeypot?: unknown; drawnAt?: unknown };
};

/**
 * Server-side API route for handling form submissions.
 *
 * This route:
 * - Receives form data from the client
 * - Refuses anything that cannot show a person filled the form in
 * - Authenticates with Payload using server-side credentials (e.g. API key)
 * - Submits the form to Payload's form-submissions collection
 * - Returns only a minimal success/error response to the client
 *
 * The check lives here rather than in a Payload hook because a Turnstile token
 * may only be verified once, and this is the first server the submission
 * touches. The collection's own access rules still apply underneath.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body. The proof is pulled out here so the rest is the
    // submission exactly as Payload expects it
    const { humanCheck, ...body }: Body = await request.json();

    // Validate required fields
    if (!body.form || !body.submissionData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const ip = clientIp(request.headers);

    // Counted before anything expensive happens, so a flood costs this machine
    // a map lookup rather than a round trip to Cloudflare and a write
    const allowance = rateLimit(`form:${ip ?? 'unknown'}`);

    if (!allowance.ok) {
      return NextResponse.json(
        { error: 'Too many submissions' },
        {
          status: 429,
          headers: { 'Retry-After': String(allowance.retryAfterSeconds) }
        }
      );
    }

    const env = getEnv(false);
    const check = await verifyHuman(humanCheck ?? {}, {
      secretKey: env?.HUMAN_CHECK?.secretKey,
      ip
    });

    if (!check.ok) {
      // Logged with its reason, answered without one: a script should not be
      // told which gate closed on it
      console.warn(`Form submission refused: ${check.reason}`);

      return NextResponse.json(
        { error: 'Could not accept this submission' },
        { status: 400 }
      );
    }

    // Get authenticated Payload instance (uses server-side API key)
    const runtime = await payloadRuntime();

    // Submit the form to Payload's form-submissions collection
    const { id } = await createFormSubmission(runtime, body);

    // Return minimal success response (don't expose full form submission data)
    return NextResponse.json({
      success: true,
      id
    });
  } catch (error) {
    console.error('Form submission error:', error);

    return NextResponse.json(
      {
        error: 'Failed to submit form',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
