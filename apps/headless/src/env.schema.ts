import { coerceBoolean, withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

/** Server-side configuration, one deployment per tenant */
export const EnvSchema = z.object({
  PAYLOAD_URL: withEnvVars(
    z
      .string({ description: 'Fully qualified URL to the Payload app host' })
      .url()
  ),
  PAYLOAD_API_KEY: z
    .string({ description: 'Payload tenant API key' })
    .min(1, { message: 'PAYLOAD_API_KEY is required' }),
  SIGNATURE_SECRET: z
    .string({ description: 'Secret key for API request signatures' })
    .min(1, { message: 'SIGNATURE_SECRET is required' }),
  TENANT_ID: z
    .string({ description: 'Tenant slug' })
    .min(1, { message: 'TENANT_ID is required' }),
  DEPLOY_ENV: z
    .enum(['development', 'preview', 'production'])
    .default('development'),
  APP_SHA: z.string({ description: 'Commit sha of the build' }).optional(),
  APP_BUILD_TIME: z
    .string({ description: 'ISO timestamp when the image was built' })
    .optional(),
  SENTRY_DSN: z
    .string({
      description: 'Sentry DSN, where errors and CSP violations are reported'
    })
    .optional(),
  SENTRY_RELEASE: z
    .string({ description: 'Sentry release, set by the deploy' })
    .optional(),
  CSP_ENFORCE: coerceBoolean(false),
  SITE_GATE_PASSWORD: z
    .string({ description: 'Closes the whole site behind this password' })
    .optional(),
  // Site statistics are collected only when set
  UMAMI_URL: z
    .string({
      description: 'Base URL of the Umami instance site statistics go to'
    })
    .url()
    .optional(),
  // Licensed typefaces. Both absent is the safe state: no base means no face
  // is written, and no allowlist means no site is entitled to one.
  FONT_ASSETS_BASE_URL: z
    .string({
      description: 'Where the platform serves its own font files from'
    })
    .optional(),
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
    .string({
      description:
        'Comma-separated ids of the licensed typefaces this deployment may embed'
    })
    .optional(),
  FLY_APP_NAME: z
    .string({ description: "This deployment's Fly app name, set by Fly" })
    .optional(),
  DEBUG: z
    .string({ description: 'Debug mode' })
    .transform((value) => value === 'true')
    .default('false')
});

export type Env = z.infer<typeof EnvSchema>;
