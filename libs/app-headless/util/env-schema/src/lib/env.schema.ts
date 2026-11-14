import { coerceBoolean, withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

/** Server-side configuration, one deployment per tenant */
export const EnvSchema = z.object({
  PAYLOAD_URL: withEnvVars(
    z.string().url().describe('Fully qualified URL to the Payload app host')
  ),
  PAYLOAD_API_KEY: z
    .string()
    .min(1, { message: 'PAYLOAD_API_KEY is required' })
    .describe('Payload tenant API key'),
  SIGNATURE_SECRET: z
    .string()
    .min(1, { message: 'SIGNATURE_SECRET is required' })
    .describe('Secret key for API request signatures'),
  TENANT_ID: z
    .string()
    .min(1, { message: 'TENANT_ID is required' })
    .describe('Tenant slug'),
  DEPLOY_ENV: z
    .enum(['development', 'preview', 'production'])
    .default('development'),
  APP_SHA: z.string().optional().describe('Commit sha of the build'),
  APP_BUILD_TIME: z
    .string()
    .optional()
    .describe('ISO timestamp when the image was built'),
  SENTRY_DSN: z
    .string()
    .optional()
    .describe('Sentry DSN, where errors and CSP violations are reported'),
  SENTRY_RELEASE: z
    .string()
    .optional()
    .describe('Sentry release, set by the deploy'),
  CSP_ENFORCE: coerceBoolean(false),
  // A blank line in an env file means "not set", not a too-short password
  SITE_GATE_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .min(8, { message: 'SITE_GATE_PASSWORD must be at least 8 characters' })
      .optional()
      .describe('Closes the whole site behind this password')
  ),
  // Site statistics are collected only when set
  UMAMI_URL: z
    .string()
    .url()
    .optional()
    .describe('Base URL of the Umami instance site statistics go to'),
  // Licensed typefaces. Both absent is the safe state: no base means no face
  // is written, and no allowlist means no site is entitled to one.
  FONT_ASSETS_BASE_URL: z
    .string()
    .optional()
    .describe('Where the platform serves its own font files from'),
  /**
   * The licensed typefaces this deployment's site may embed.
   *
   * The font licence permits embedding only on sites the licensee owns or
   * controls, so the entitlement belongs to the site being served: set it
   * under `/tenants/<tenant>/apps/headless/` and it reaches that deployment
   * and no other. Named per font because each licence covers one typeface on
   * its own terms.
   */
  RESTRICTED_FONTS: z
    .string()
    .optional()
    .describe(
      'Comma-separated ids of the licensed typefaces this deployment may embed'
    ),
  FLY_APP_NAME: z
    .string()
    .optional()
    .describe("This deployment's Fly app name, set by Fly"),
  // A default after a transform is returned as is in zod 4, so it is given in
  // the output type rather than as the raw string
  DEBUG: z
    .string()
    .transform((value) => value === 'true')
    .default(false)
    .describe('Debug mode')
});

export type Env = z.infer<typeof EnvSchema>;
