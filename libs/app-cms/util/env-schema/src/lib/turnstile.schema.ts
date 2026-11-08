import { z } from 'zod';

/**
 * Cloudflare Turnstile environment schema for checking that a form submission
 * came from a person.
 *
 * The site key is public by design — it is rendered into the page — while the
 * secret verifies the resulting token server-side and must never leave it.
 *
 * A widget lists the hostnames it may be drawn on, so a tenant can bring its
 * own pair. The loader takes the whole pair from the highest folder that sets
 * either key, never one half from each:
 *
 * 1. `/tenants/<tenant>/apps/cms`: one app of the tenant
 * 2. `/tenants/<tenant>`: every app of the tenant
 * 3. `/apps/cms`: the shared default, and the host's own pages
 *
 * Keys are read at boot only, so a new pair needs a restart.
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
