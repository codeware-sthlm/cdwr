import { z } from 'zod';

export const ActionInputsSchema = z
  .object({
    flyApiToken: z.string().optional(),
    flyTraceCli: z.boolean().optional(),
    flyConsoleLogs: z.boolean().optional(),
    token: z.string().min(1, 'A GitHub token is required'),
    postgresCluster: z.string().optional(),
    databaseName: z.string().optional(),
    dryRun: z.boolean().default(false)
  })
  .refine((inputs) => !!inputs.postgresCluster === !!inputs.databaseName, {
    message:
      'postgres-cluster and database-name must be set together, or both left empty',
    path: ['databaseName']
  });

export type ActionInputs = z.infer<typeof ActionInputsSchema>;
