'use server';

import { redirect } from 'next/navigation';
import { getPayload } from 'payload';

import config from '../../../../../payload.config';

/** Spends the token, on a press of the confirm button and never on a plain visit */
export async function confirmEmail(token: string): Promise<never> {
  const payload = await getPayload({ config });

  let result: 'verified' | 'invalid' = 'verified';
  try {
    await payload.verifyEmail({ collection: 'users', token });
  } catch {
    // Unknown, expired or used: the page words it
    result = 'invalid';
  }

  redirect(`/signup/verify/${encodeURIComponent(token)}?result=${result}`);
}
