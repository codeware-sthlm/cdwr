import { z } from 'zod';

/**
 * Any SMTP relay — a local catcher, a hosted sandbox, or a real one.
 *
 * Deliberately generic rather than named after a provider: `SENDGRID_*` locks
 * a deployment to whichever service happens to be behind it, so swapping
 * providers means renaming variables everywhere they're read. Auth is
 * optional because Mailpit (`nx dx:mail cms`), the development default,
 * needs none — a hosted catcher such as Mailtrap, or a real relay, supplies
 * both.
 */
export const SmtpSchema = z.object({
  SMTP_FROM_ADDRESS: z
    .string()
    .email()
    .describe('Default from address')
    .optional()
    .or(z.literal('')),
  SMTP_FROM_NAME: z.string().optional().describe('Default from name'),
  SMTP_HOST: z.string().describe('SMTP host'),
  SMTP_PORT: z.coerce
    .number()
    .describe('SMTP port — 465 for implicit TLS, otherwise STARTTLS'),
  SMTP_USERNAME: z.string().optional().describe('SMTP username'),
  SMTP_PASSWORD: z.string().optional().describe('SMTP password')
});

export type Smtp = z.infer<typeof SmtpSchema>;
