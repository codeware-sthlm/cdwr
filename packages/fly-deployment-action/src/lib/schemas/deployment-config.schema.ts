import {
  AppDetailsSchema,
  DeployableAppSchema
} from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

import { ActionInputsSchema } from './action-inputs.schema';

export const DeploymentConfigSchema = z.object({
  env: z.record(z.string(), z.string()).optional(),
  fly: z.object({
    token: z.string().min(1, 'Fly API token is required'),
    org: z.string(),
    region: z.string(),
    optOutDepotBuilder: z.boolean(),
    traceCLI: z.boolean(),
    consoleLogs: z.boolean()
  }),
  secrets: z.record(z.string(), z.string()).optional(),
  apps: z.array(DeployableAppSchema),
  appDetails: AppDetailsSchema,
  // Present only when id, secret and project id are all given
  infisical: z
    .object({
      clientId: z.string().nonempty('Infisical client ID is required'),
      clientSecret: z.string().nonempty('Infisical client secret is required'),
      projectId: z.string().nonempty('Infisical project ID is required'),
      site: z.enum(['eu', 'us'], {
        message: 'Infisical site must be either "eu" or "us"'
      })
    })
    .optional(),
  token: ActionInputsSchema.shape.token
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
