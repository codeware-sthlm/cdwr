import { withEnvVars } from '@codeware/shared/util/zod';
import { z } from 'zod';

/**
 * A schema for validating GitHub app Fly deployment configuration.
 *
 * Every app that needs to be deployed via Fly must have a `github.json` file
 * with the following structure.
 */
export const GitHubConfigSchema = withEnvVars(
  z.object({
    flyPostgresPreview: z
      .string()
      .regex(/^[a-zA-Z0-9_-]*$/, 'flyPostgresPreview pattern is invalid')
      .optional(),

    flyPostgresProduction: z
      .string()
      .regex(/^[a-zA-Z0-9_-]*$/, 'flyPostgresProduction pattern is invalid')
      .optional(),

    flyPostgresDatabaseName: z
      .string()
      .regex(/^[a-zA-Z0-9_-]*$/, 'flyPostgresDatabaseName pattern is invalid')
      .optional(),

    sharedSecrets: z.boolean().optional()
  }),
  { throwOnMissing: true, undefinedIsEmpty: true }
);

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
