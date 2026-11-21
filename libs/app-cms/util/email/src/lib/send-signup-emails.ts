import type { Payload } from 'payload';

export type PlatformMail = { subject: string; html: string; text: string };

export type SignupEmailsInput = {
  /** Confirmation mail to the new user */
  verify: { to: string; mail: PlatformMail };
  /** Notice to the platform owner; omitted when nobody is to be told */
  notice?: { to: string | Array<string>; mail: PlatformMail };
};

/**
 * Send the mail a self-serve signup generates: the confirmation to the new
 * user and, when given, the notice to the platform owner.
 *
 * Never throws. The workspace exists once the signup is stored, and a mail
 * failure must not undo that; it is logged instead, naming the mail but never
 * the link, which carries a token.
 */
export async function sendSignupEmails(
  payload: Payload,
  { notice, verify }: SignupEmailsInput
): Promise<void> {
  await sendPlatformMail(payload, {
    to: verify.to,
    mail: verify.mail,
    label: 'verify'
  });

  if (notice) {
    await sendPlatformMail(payload, {
      to: notice.to,
      mail: notice.mail,
      label: 'notice'
    });
  }
}

/**
 * Send one mail and never throw. A failure is logged with the mail's label,
 * never its content, which may carry a token.
 *
 * @returns Whether the mail was sent
 */
export async function sendPlatformMail(
  payload: Payload,
  {
    label,
    mail,
    to
  }: { to: string | Array<string>; mail: PlatformMail; label: string }
): Promise<boolean> {
  try {
    await payload.sendEmail({ to, ...mail });
    return true;
  } catch (error) {
    payload.logger.error(
      `[signupEmails] Could not send the ${label} mail: ${String(error)}`
    );
    return false;
  }
}
