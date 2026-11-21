import { z } from 'zod';

/**
 * Infisical system admin schema.
 *
 * Path: `/cms`
 *
 * TODO: Name conversion
 */
export const SystemAdminEnvSchema = z.object({
  SYSTEM_ADMIN_EMAIL: z
    .string()
    .email({ message: 'SYSTEM_ADMIN_EMAIL must be a valid email address' })
    .describe('Email of a system admin user'),
  SYSTEM_ADMIN_NAME: z
    .string()
    .min(1, { message: 'SYSTEM_ADMIN_NAME is required' })
    .describe('Name of a system admin user'),
  SYSTEM_ADMIN_PASSWORD: z
    .string()
    .min(1, { message: 'SYSTEM_ADMIN_PASSWORD is required' })
    .describe('Password of a system admin user')
});

export type SystemAdminEnv = z.infer<typeof SystemAdminEnvSchema>;
