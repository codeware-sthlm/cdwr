import { DeployableAppSchema } from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

const EnvironmentSchema = z.enum(['preview', 'production', '']);

const AppTenantDetailsSchema = z
  .object({
    tenant: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    // Names only: the deployment action reads the values from Infisical
    secretNames: z.array(z.string()).optional()
  })
  .strict();

export const ActionOutputsSchema = z.object({
  apps: z.array(DeployableAppSchema),
  environment: EnvironmentSchema,
  appTenants: z.record(z.string(), z.array(AppTenantDetailsSchema))
});

export type AppTenantDetails = z.infer<typeof AppTenantDetailsSchema>;
export type ActionOutputs = z.infer<typeof ActionOutputsSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
