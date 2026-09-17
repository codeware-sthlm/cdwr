import { z } from 'zod';

/**
 * Whole-site gate environment schema — one shared password per tenant and
 * environment, asked for before the site is shown.
 *
 * Present means the site is closed; absent means it is public. Belongs in the
 * tenant's app folder — `/tenants/<deployment>/apps/<app>` — which the deploy
 * reads and sets on the Fly app, the same route `PAYLOAD_API_KEY` takes. The
 * tenant root is not a substitute: `loadEnv` only reaches Infisical when the
 * environment is short of something, so a value there can go unread.
 *
 * Infisical secrets are per environment, so a tenant's preview can be closed
 * while its production site stays open, with no second setting to disagree.
 *
 * A minimum length is enforced rather than trusted: the password is the only
 * thing standing in front of an unreleased site, and a two-character one would
 * pass unnoticed.
 */
export const SiteGateSchema = z.object({
  // An empty value is how an env file says "not set", and the whole app must
  // not refuse to start over a blank line meant to document the variable
  SITE_GATE_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string({ description: 'Shared password the site asks visitors for' })
      .min(12, { message: 'SITE_GATE_PASSWORD must be at least 12 characters' })
      .optional()
  )
});

export type SiteGate = z.infer<typeof SiteGateSchema>;
