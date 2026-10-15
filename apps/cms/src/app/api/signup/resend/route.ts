import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { sendPlatformMail } from '@codeware/app-cms/util/email';
import { rateLimit } from '@codeware/shared/util/human-check';
import { NextRequest, NextResponse } from 'next/server';
import { type BasePayload, getPayload } from 'payload';

import { verifyEmailMail } from '../../../../collections/users/verify-email';
import config from '../../../../payload.config';
import { refuseUnlessHuman } from '../../../../security/public-submit';
import { isSignupBody } from '../../../../utils/signup';

/** Resends per address and window, below the signup's own limit */
const RESEND_RATE_LIMIT = 3;

/** Mails to one email address per hour, whoever asks */
const PER_EMAIL_LIMIT = 3;
const HOUR = 60 * 60 * 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every request that gets this far is answered the same */
const answered = () => NextResponse.json({ ok: true });

/** The stored link again, when the address belongs to an unconfirmed account */
async function resend(
  payload: BasePayload,
  email: string,
  locale: 'en' | 'sv'
) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true
  });
  const user = docs[0];
  const token = user?._verificationToken;
  if (!user || user._verified !== false || !token) {
    return;
  }

  await sendPlatformMail(payload, {
    to: email,
    label: 'verify again',
    mail: verifyEmailMail(payload, { token, name: user.name, locale })
  });
}

/**
 * Send a confirmation link again to an account that never got to confirm.
 *
 * The answer never tells whether the address has an account, or whether it
 * needed a mail: every accepted request gets the same answer straight away,
 * and the lookup and the mail happen after it.
 */
export async function POST(request: NextRequest) {
  if (getEnv().APP_MODE.type !== 'host') {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (!isSignupBody(body)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const email =
    typeof body['email'] === 'string' ? body['email'].trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const locale = body['locale'] === 'sv' ? 'sv' : 'en';

  const refusal = await refuseUnlessHuman(
    request,
    'signup-resend',
    body.humanCheck,
    { limit: RESEND_RATE_LIMIT }
  );
  if (refusal) {
    return refusal;
  }

  const payload = await getPayload({ config });

  // Counted for every request, so a flood cannot fill one inbox, and the
  // answer is the same whether it was over the limit or not
  if (
    !rateLimit(`resend:${email}`, { limit: PER_EMAIL_LIMIT, windowMs: HOUR }).ok
  ) {
    return answered();
  }

  void resend(payload, email, locale).catch((error) =>
    payload.logger.error(`[signupResend] Resend failed: ${String(error)}`)
  );

  return answered();
}
