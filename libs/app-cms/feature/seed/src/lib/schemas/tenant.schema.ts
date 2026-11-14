import { withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

/**
 * Infisical tenant schema.
 *
 * Path: `/web/tenants/<tenantKey>`
 *
 * TODO: Name conversion
 */
export const TenantEnvSchema = withEnvVars(
  z.object({
    PAYLOAD_ADMIN_EMAIL: z
      .string()
      .email({ message: 'PAYLOAD_ADMIN_EMAIL must be a valid email address' })
      .describe('Email of a tenant admin user'),
    PAYLOAD_ADMIN_NAME: z
      .string()
      .min(1, { message: 'PAYLOAD_ADMIN_NAME is required' })
      .describe('Name of a tenant admin user'),
    PAYLOAD_ADMIN_PASSWORD: z
      .string()
      .min(1, { message: 'PAYLOAD_ADMIN_PASSWORD is required' })
      .describe('Password of a tenant admin user'),
    PAYLOAD_API_DESCRIPTION: z
      .string()
      .optional()
      .describe('Description of the tenant'),
    PAYLOAD_API_HOST: z
      .string()
      .min(1, { message: 'PAYLOAD_API_HOST is required' })
      .describe('Client host for the tenant'),
    PAYLOAD_API_KEY: z
      .string()
      .min(1, { message: 'PAYLOAD_API_KEY is required' })
      .describe('API key for tenant'),
    PAYLOAD_API_NAME: z
      .string()
      .min(1, { message: 'PAYLOAD_API_NAME is required' })
      .describe('Name of the tenant')
  })
);

export type TenantEnv = z.infer<typeof TenantEnvSchema>;
