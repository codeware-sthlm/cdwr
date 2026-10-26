import { withEnvVars } from '@codeware/shared/util/zod';
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
  DEBUG: z
    .string({ description: 'Debug mode' })
    .transform((value) => value === 'true')
    .default('false')
});

export type Env = z.infer<typeof EnvSchema>;
