import { coerceBoolean, withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

import { S3StorageSchema } from './s3-storage.schema';
import { SeedSourceSchema } from './seed-source.schema';
import { SeedStrategySchema } from './seed-strategy.schema';
import { SendGridSchema } from './sendgrid.schema';
import { SentrySchema } from './sentry.schema';
import { SmtpSchema } from './smtp.schema';
import { TurnstileSchema } from './turnstile.schema';

type AppModeCommon = {
  /** Fully qualified URL to the cms app */
  serverURL: string;
};
type AppModeHost = AppModeCommon & {
  type: 'host';
  /** Accepted request signature secrets, active secret first */
  signatureSecrets: Array<string>;
};
type AppModeTenant = AppModeCommon & {
  type: 'tenant';
  apiKey: string;
  tenantId: string;
};

/**
 * Environment base schema with environment variable lookup.
 */
export const EnvSchema = withEnvVars(
  z
    .object({
      // Environment (injected by deployment action)
      APP_NAME: z.string({ description: 'Name of the application' }),
      DEPLOY_ENV: z.enum(['development', 'preview', 'production']),
      FLY_URL: z.string({ description: 'Auto-generated Fly.io app URL' }),
      PR_NUMBER: z.string({ description: 'Number of the pull request' }),

      // Licensed typefaces. Both absent is the safe state: no base means no
      // face is written, and no allowlist means no site is entitled to one.
      FONT_ASSETS_BASE_URL: z
        .string({
          description: 'Where the platform serves its own font files from'
        })
        .optional(),
      RESTRICTED_FONTS: z
        .string({
          description:
            'Comma-separated ids of the licensed typefaces this deployment may embed'
        })
        .optional(),

      // Build metadata (injected as Docker build args on deploy; absent in dev)
      APP_SHA: z.string({ description: 'Commit sha of the build' }).optional(),
      APP_BUILD_TIME: z
        .string({ description: 'ISO timestamp when the image was built' })
        .optional(),

      // Tenant deployment (optional - only present when deployed for a specific tenant)
      TENANT_ID: z
        .string({ description: 'Tenant identifier for site deployments' })
        .optional(),
      PAYLOAD_API_KEY: z
        .string({ description: 'Tenant API key for site deployments' })
        .optional(),

      // Applied by Next.js
      NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),

      // Payload configuration
      CORS_URLS: z
        .string({ description: 'List of allowed URLs for CORS' })
        .or(z.literal('*'))
        .default('*'),
      CSRF_URLS: z
        .string({
          description:
            'List of allowed URLs to accept cookie-based authentication from'
        })
        .default(''),
      DATABASE_URL: z
        .string({
          description: 'Database connection string including database name'
        })
        .min(1, { message: 'DATABASE_URL is required' }),
      DATABASE_SCHEMA: z
        .string({ description: 'Database schema name for Payload tables' })
        .min(1),
      LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
      PAYLOAD_SECRET_KEY: z
        .string({ description: 'Payload secret key' })
        .min(1, { message: 'PAYLOAD_SECRET_KEY is required' }),
      PAYLOAD_URL: z
        .string({
          description: 'Fallback URL to the Payload CMS instance'
        })
        .optional()
        .default('http://localhost:3000'),

      // Api key request verification
      SIGNATURE_SECRET: z
        .string({ description: 'Secret key for API request signatures' })
        .optional(),
      SIGNATURE_SECRET_PREVIOUS: z
        .string({
          description:
            'Previous signature secret, kept valid while clients roll over to a new one'
        })
        .optional(),

      // Seed configuration
      SEED_DATA_URL: z
        .string({ description: 'URL to public seed data files' })
        .optional(),
      SEED_SOURCE: SeedSourceSchema.default('cloud-local'),
      SEED_STRATEGY: SeedStrategySchema.default('delta'),

      // Internal
      DISABLE_DB_PUSH: coerceBoolean(false).describe(
        'Disable database schema push in development'
      ),
      DISABLE_DOMAIN_ADOPTION: coerceBoolean(false).describe(
        "Skip taking a database-stored domain as the app's own url at boot — cors/csrf still accept it as an origin — the break-glass escape hatch when a stored domain stops working"
      ),
      NX_TASK_TARGET_TARGET: z
        .enum(
          [
            'build',
            'dev',
            'gen',
            'lint',
            'payload',
            'reset-db',
            'seed',
            'serve',
            'test',
            'verify'
          ],
          {
            description:
              'NX environment variable set to the project target that run'
          }
        )
        .or(z.literal(''))
        .default('')
    })
    // S3 storage is optional
    .merge(S3StorageSchema.partial())
    // SendGrid is optional
    .merge(SendGridSchema.partial())
    // Sentry is optional
    .merge(SentrySchema.partial())
    .merge(SmtpSchema.partial())
    // Turnstile is optional — a site without it still has the honeypot
    .merge(TurnstileSchema.partial())
    // SIGNATURE_SECRET is required for non-tenant deployments (CMS host)
    .refine(
      (data) => {
        if (!data.TENANT_ID && !data.SIGNATURE_SECRET) {
          return false;
        }
        return true;
      },
      {
        message:
          'SIGNATURE_SECRET is required for CMS host (TENANT_ID is not specified)',
        path: ['SIGNATURE_SECRET']
      }
    )
    // PAYLOAD_API_KEY is required for tenant deployments
    .refine(
      (data) => {
        if (data.DEPLOY_ENV === 'development') {
          // In development, PAYLOAD_API_KEY is optional since it can be resolved from seed data
          return true;
        }
        if (data.TENANT_ID && !data.PAYLOAD_API_KEY) {
          return false;
        }
        return true;
      },
      {
        message:
          'PAYLOAD_API_KEY is required for tenant mode (TENANT_ID is specified)',
        path: ['PAYLOAD_API_KEY']
      }
    )
).transform(
  // Transform environment variables to internal and structured format
  ({
    APP_NAME,
    SMTP_FROM_ADDRESS,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    FLY_URL,
    FONT_ASSETS_BASE_URL,
    NX_TASK_TARGET_TARGET,
    PAYLOAD_API_KEY,
    PAYLOAD_URL,
    RESTRICTED_FONTS,
    S3_ACCESS_KEY_ID,
    S3_BUCKET,
    S3_ENDPOINT,
    S3_FORCE_PATH_STYLE,
    S3_REGION,
    S3_SECRET_ACCESS_KEY,
    SENDGRID_API_KEY,
    SENDGRID_FROM_ADDRESS,
    SENDGRID_FROM_NAME,
    SENTRY_DSN,
    SENTRY_ORG,
    SENTRY_RELEASE,
    SIGNATURE_SECRET,
    SIGNATURE_SECRET_PREVIOUS,
    TENANT_ID,
    TURNSTILE_SECRET_KEY,
    TURNSTILE_SITE_KEY,
    ...env
  }) => ({
    ...env,
    // Pulled out above for the SMTP sender name; the schema still exposes it
    APP_NAME,
    /**
     * How the cms app is configured and running.
     * Either as cms host (`host`) or tenant-scoped client (`tenant`).
     */
    APP_MODE: TENANT_ID
      ? ({
          type: 'tenant',
          serverURL: FLY_URL || PAYLOAD_URL,
          apiKey: PAYLOAD_API_KEY ?? '', // guarded by related refine above
          tenantId: TENANT_ID
        } satisfies AppModeTenant)
      : ({
          type: 'host',
          serverURL: FLY_URL || PAYLOAD_URL,
          signatureSecrets: [
            SIGNATURE_SECRET ?? '', // guarded by related refine above
            ...(SIGNATURE_SECRET_PREVIOUS ? [SIGNATURE_SECRET_PREVIOUS] : [])
          ]
        } satisfies AppModeHost),
    // Expose Fly url for e.g. dynamic cors configuration
    FLY_URL,
    FONT_ASSETS_BASE_URL,
    /**
     * The licensed typefaces this deployment's site may embed.
     *
     * The font licence permits embedding only on sites the licensee owns or
     * controls, so the entitlement belongs to the *site being served* rather
     * than to whoever authored the theme — an admin gate cannot express that.
     *
     * Which site is settled by where the secret lives: set it under
     * `/tenants/<tenant>/apps/cms/` and it reaches that deployment and no
     * other. Named per font because each licence covers one typeface on its
     * own terms. Passed through raw — `entitledFonts` reads it.
     */
    RESTRICTED_FONTS,
    // Rename to declarative variable for easier use in codebase
    NX_RUN_TARGET: NX_TASK_TARGET_TARGET ?? '',
    // Transform to storage object if S3 access key id is provided
    S3_STORAGE: S3_ACCESS_KEY_ID
      ? {
          bucket: String(S3_BUCKET),
          endpoint: String(S3_ENDPOINT),
          forcePathStyle: S3_FORCE_PATH_STYLE ?? false,
          region: String(S3_REGION),
          credentials: {
            accessKeyId: S3_ACCESS_KEY_ID,
            secretAccessKey: String(S3_SECRET_ACCESS_KEY)
          }
        }
      : undefined,
    EMAIL:
      // Transform to sendgrid object if sendgrid api key is provided
      SENDGRID_API_KEY
        ? {
            sendgrid: {
              apiKey: SENDGRID_API_KEY,
              // Falling back rather than stringifying: the address is optional
              // in the schema, and `String(undefined)` would put the literal
              // 'undefined' in the From header instead of leaving it empty for
              // the sender fallback to notice
              defaultFromAddress: SENDGRID_FROM_ADDRESS || '',
              defaultFromName: SENDGRID_FROM_NAME || APP_NAME
            }
          }
        : // A local mail catcher takes precedence over nothing being
          // configured at all. Both host and a usable port are required — a
          // half-configured catcher would fail on every send instead of
          // falling through to the development-only on-demand fallback below.
          SMTP_HOST && Number.isFinite(Number(SMTP_PORT))
          ? {
              smtp: {
                // Falling back rather than stringifying: `String(undefined)`
                // would put the literal 'undefined' in the From header
                defaultFromAddress: SMTP_FROM_ADDRESS || 'no-reply@localhost',
                defaultFromName: SMTP_FROM_NAME || APP_NAME,
                host: SMTP_HOST,
                port: Number(SMTP_PORT),
                // Authenticating still needs both — the adapter checks that —
                // but a lone one is passed through rather than dropped, so the
                // boot log can name the half-configured pair. Dropping it here
                // would leave a typo looking exactly like a catcher, and the
                // relay would then reject every send for no visible reason.
                user: SMTP_USERNAME,
                pass: SMTP_PASSWORD
              }
            }
          : undefined,
    SENTRY:
      SENTRY_DSN && SENTRY_ORG
        ? {
            dsn: SENTRY_DSN,
            org: SENTRY_ORG,
            release: SENTRY_RELEASE
          }
        : undefined,
    /**
     * Turnstile, when both halves of the pair are configured.
     *
     * Both or neither: a site key with no secret renders a widget nothing
     * checks, and a secret with no site key rejects every submission because
     * no token was ever collected.
     */
    HUMAN_CHECK:
      TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY
        ? {
            siteKey: TURNSTILE_SITE_KEY,
            secretKey: TURNSTILE_SECRET_KEY
          }
        : undefined
  })
);

export type Env = z.infer<typeof EnvSchema>;
