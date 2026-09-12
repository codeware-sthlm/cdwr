import { z } from 'zod';

/**
 * Cloudflare Turnstile environment schema for checking that a form submission
 * came from a person.
 *
 * The site key is public by design — it is rendered into the page — while the
 * secret verifies the resulting token server-side and must never leave it.
 */
export const TurnstileSchema = z.object({
  TURNSTILE_SITE_KEY: z.string({
    description: 'Public key the widget is rendered with'
  }),
  TURNSTILE_SECRET_KEY: z.string({
    description: 'Secret the submitted token is verified against'
  })
});

export type Turnstile = z.infer<typeof TurnstileSchema>;
