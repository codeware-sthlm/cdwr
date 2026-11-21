import {
  type AppDeploymentDetails,
  AppDetailsSchema,
  DeployableAppSchema,
  EnvironmentSchema
} from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

export const ActionInputsSchema = z.object({
  apps: z.array(DeployableAppSchema),
  env: z.array(z.string()).optional(),
  environment: EnvironmentSchema,
  flyApiToken: z.string().optional(),
  flyOrg: z.string().optional(),
  flyRegion: z.string().optional(),
  flyTraceCli: z.boolean().optional(),
  flyConsoleLogs: z.boolean().optional(),
  images: z.record(z.string(), z.string()).optional(),
  // Read the values of the secrets a tenant deployment names
  infisicalClientId: z.string().optional(),
  infisicalClientSecret: z.string().optional(),
  infisicalProjectId: z.string().optional(),
  infisicalSite: z.enum(['eu', 'us']).optional(),
  optOutDepotBuilder: z.boolean().optional(),
  // Takes precedence over the event payload; required for preview
  prNumber: z.number().int().positive().optional(),
  secrets: z.array(z.string()).optional(),
  appDetails: AppDetailsSchema.optional(),
  token: z.string().min(1, 'A GitHub token is required')
});

export type { AppDeploymentDetails };
export type ActionInputs = z.infer<typeof ActionInputsSchema>;
