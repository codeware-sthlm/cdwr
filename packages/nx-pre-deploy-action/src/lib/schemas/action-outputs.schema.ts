import {
  AppDeploymentDetailsSchema,
  DeployableAppSchema
} from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

const EnvironmentSchema = z.enum(['preview', 'production', '']);

export const ActionOutputsSchema = z.object({
  apps: z.array(DeployableAppSchema),
  environment: EnvironmentSchema,
  appTenants: z.record(z.string(), z.array(AppDeploymentDetailsSchema))
});

export type ActionOutputs = z.infer<typeof ActionOutputsSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
