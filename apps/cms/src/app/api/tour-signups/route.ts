import { createTourSignup } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { guardHeaders, guardSubmit } from '@codeware/shared/util/human-check';
import { NextRequest, NextResponse } from 'next/server';

import { payloadRuntime } from '../../../security/payload-runtime';

type Body = {
  humanCheck?: { token?: unknown; honeypot?: unknown; drawnAt?: unknown };
  tour?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  people?: unknown;
  acceptedTerms?: unknown;
};

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Server-side API route for tour signups.
 *
 * This route:
 * - Receives the customer's details from the site
 * - Refuses anything that cannot show a person filled the form in
 * - Authenticates with Payload using server-side credentials (api key)
 * - Creates the signup, whose status the server decides from capacity
 * - Returns only that status, never the signup itself
 *
 * The status is the one thing the customer has to be told: booked, or on the
 * waiting list. Nothing else about the tour's signups is exposed here.
 */
export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json();

    const tour = Number(body.tour);
    const name = asString(body.name);
    const email = asString(body.email);
    const people = Number(body.people);

    if (
      !Number.isInteger(tour) ||
      tour < 1 ||
      !name ||
      !email ||
      !Number.isInteger(people) ||
      people < 1
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const env = getEnv(false);
    const guard = await guardSubmit({
      fields: body.humanCheck ?? {},
      headers: request.headers,
      scope: 'tour-signup',
      secretKey: env?.HUMAN_CHECK?.secretKey
    });

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.message, message: guard.message },
        { status: guard.status, headers: guardHeaders(guard) }
      );
    }

    const runtime = await payloadRuntime();

    const signup = await createTourSignup(runtime, {
      tour,
      name,
      email,
      people,
      phone: asString(body.phone) || null,
      acceptedTerms: body.acceptedTerms === true
    });

    return NextResponse.json({
      success: true,
      id: signup.id,
      status: signup.status
    });
  } catch (error) {
    const status =
      error &&
      typeof error === 'object' &&
      'status' in error &&
      typeof error.status === 'number'
        ? error.status
        : 500;

    // A refused signup is an answer, not a fault: capacity and a closed tour
    // arrive as 4xx carrying a message already written for the customer, so it
    // is passed through. Anything else stays generic — an internal message is
    // not something to hand a visitor — and is logged instead.
    if (status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : 'Signup refused';
      return NextResponse.json({ error: message, message }, { status });
    }

    console.error('Tour signup error:', error);

    return NextResponse.json(
      { error: 'Failed to submit signup', message: 'Failed to submit signup' },
      { status: 500 }
    );
  }
}
