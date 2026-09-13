import { withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

/**
 * Required environment variables
 */
export const EnvSchema = z.object({
  // Standard Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']),

  // Injected at deployment
  DEPLOY_ENV: z.enum(['development', 'preview', 'production']),

  // Build metadata (injected as Docker build args on deploy; absent in dev)
  APP_SHA: z.string({ description: 'Commit sha of the build' }).optional(),
  APP_BUILD_TIME: z
    .string({ description: 'ISO timestamp when the image was built' })
    .optional(),
  TENANT_ID: z
    .string({ description: 'Application identifier' })
    .min(1, { message: 'TENANT_ID is required' }),

  // Loaded at run-time
  PAYLOAD_API_KEY: z
    .string({ description: 'Payload tenant API key' })
    .optional()
    .refine(
      (val) => {
        if (val) {
          return true;
        }
        // In development, the API key can be optional as it can be resolved from the multi-tenant Nginx proxy header or tenant id env
        if (process.env.DEPLOY_ENV === 'development') {
          return true;
        }
        // In non-development environments, the API key is required
        return false;
      },
      { message: 'PAYLOAD_API_KEY is required in non-development environments' }
    ),
  PAYLOAD_URL: withEnvVars(
    z.string({
      description: 'Fully qualified URL to the Payload app host'
    })
  ),
  PORT: z.coerce.number({ description: 'Port to run the server on' }),

  // Sentry (per app; injected on deploy, absent in dev)
  SENTRY_DSN: z
    .string({ description: 'Data Source Name - Sentry project identifier' })
    .optional(),
  SENTRY_RELEASE: z
    .string({ description: 'Release identifier `name@version+sha`' })
    .optional(),
  // Turnstile, when the deployment has a key pair. Without it a form still
  // carries the hidden field and the time it took to fill in
  TURNSTILE_SITE_KEY: z
    .string({ description: 'Public key the widget is rendered with' })
    .optional(),
  TURNSTILE_SECRET_KEY: z
    .string({ description: 'Secret the submitted token is verified against' })
    .optional(),
  SIGNATURE_SECRET: z
    .string({ description: 'Secret key for API request signatures' })
    .min(1, {
      message: 'SIGNATURE_SECRET is required'
    }),
  DEBUG: z
    .string({ description: 'Debug mode' })
    .transform((d) => d === 'true')
    .default('false')
});

export type Env = z.infer<typeof EnvSchema>;
