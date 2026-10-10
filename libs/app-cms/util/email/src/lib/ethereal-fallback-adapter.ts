import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailAdapter } from 'payload';

/**
 * Last-resort development mail: a throwaway Ethereal inbox, made on demand.
 *
 * Ethereal accounts are disposable by design, which is exactly why the
 * credentials in a `.env` file go stale — someone has to notice and replace
 * them. Creating the account when the first message is actually sent removes
 * that chore: nothing to configure, nothing to expire, and no account made for
 * a boot that never sends anything.
 *
 * On demand rather than at startup on purpose. It costs a network call, and
 * paying that on every config load — including `generate:types` and every
 * migration — to support a mail nobody may send would be a poor trade.
 *
 * A local catcher (`nx dx:mail cms`) is the better daily loop: it works
 * offline and keeps its history. This is what you get when it is not running.
 */
export const etherealFallbackAdapter = (): EmailAdapter => {
  return ({ payload }) => {
    /** Created once per process, on the first send */
    let transport: Promise<{
      transporter: Transporter;
      user: string;
    }> | null = null;

    const connect = () => {
      transport ??= (async () => {
        const account = await nodemailer.createTestAccount();

        payload.logger.info(
          `[email] Created an Ethereal test inbox for ${account.user} — https://ethereal.email/login`
        );
        payload.logger.info(
          `[email] Sign in with user '${account.user}' and password '${account.pass}'`
        );

        return {
          transporter: nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: { user: account.user, pass: account.pass }
          }),
          user: account.user
        };
      })();

      return transport;
    };

    return {
      name: 'ethereal-fallback',
      defaultFromAddress: 'dev@ethereal.email',
      defaultFromName: 'Codeware Dev',
      sendEmail: async (message) => {
        const { transporter } = await connect();
        const info = await transporter.sendMail({
          from: `"Codeware Dev" <dev@ethereal.email>`,
          ...message
        });

        // The per-message link is the useful part — it opens the rendered mail
        // without signing in
        payload.logger.info(
          `[email] Preview '${message.subject}': ${nodemailer.getTestMessageUrl(info)}`
        );

        return info;
      }
    };
  };
};
