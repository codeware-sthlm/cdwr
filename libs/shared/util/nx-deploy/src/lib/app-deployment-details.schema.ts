import { z } from 'zod';

export const AppDeploymentDetailsSchema = z
  .object({
    tenant: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    // Names only: the deployment action reads the values from Infisical
    secretNames: z.array(z.string()).optional()
  })
  .strict();

export type AppDeploymentDetails = z.infer<typeof AppDeploymentDetailsSchema>;

export const AppDetailsSchema = z.record(
  z.string(),
  z.array(AppDeploymentDetailsSchema)
);

export type AppDetails = z.infer<typeof AppDetailsSchema>;
