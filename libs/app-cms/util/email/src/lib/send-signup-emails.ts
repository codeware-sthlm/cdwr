import type { Payload } from 'payload';

type Mail = { subject: string; html: string; text: string };

export type SignupEmailsInput = {
  /** Confirmation mail to the new user */
  verify: { to: string; mail: Mail };
  /** Notice to the platform owner; omitted when nobody is to be told */
  notice?: { to: string | Array<string>; mail: Mail };
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
  const send = async (
    kind: 'verify' | 'notice',
    to: string | Array<string>,
    mail: Mail
  ) => {
    try {
      await payload.sendEmail({ to, ...mail });
    } catch (error) {
      payload.logger.error(
        `[signupEmails] Could not send the ${kind} mail: ${String(error)}`
      );
    }
  };

  await send('verify', verify.to, verify.mail);

  if (notice) {
    await send('notice', notice.to, notice.mail);
  }
}
