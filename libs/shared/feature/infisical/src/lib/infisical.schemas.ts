import { z } from 'zod';

const ProjectSchema = z.object({
  INFISICAL_PROJECT_ID: z.string().min(1).describe('Infisical Project ID'),
  INFISICAL_SITE: z
    .enum(['eu', 'us'])
    .optional()
    .describe("Infisical Site defaults to 'us'")
});

/**
 * Infisical client credentials from environment variables
 */
export const ClientSchema = z
  .object({
    INFISICAL_CLIENT_ID: z
      .string()
      .min(1)
      .describe('Infisical Machine Client ID'),
    INFISICAL_CLIENT_SECRET: z
      .string()
      .min(1)
      .describe('Infisical Machine Client Secret'),
    ...ProjectSchema.shape
  })
  .or(
    z.object({
      INFISICAL_SERVICE_TOKEN: z
        .string()
        .min(1)
        .describe('Infisical Service Token'),
      ...ProjectSchema.shape
    })
  );

/**
 * Infisical project environment values
 */
export const EnvironmentSchema = z
  .enum(['development', 'preview', 'production'])
  .describe('The environment to get the secrets from');

/**
 * Infisical configuration from `.infisical.json`
 */
export const ConfigSchema = z.object({
  workspaceId: z
    .string()
    .min(1, {
      message: 'Workspace ID is required'
    })
    .describe('The ID of the project to connect to'),
  defaultEnvironment: EnvironmentSchema.optional(),
  gitBranchToEnvironmentMapping: z
    .record(z.string(), z.string())
    .describe('The mapping of git branches to environments')
    .nullable()
    .optional()
});

/**
 * Infisical secret metadata schema.
 *
 * The API returns `secretMetadata` as an array of objects with `key` and `value` properties,
 * while the SDK defines it as a plain record.
 *
 * Ensures both cases are handled and an array is always returned,
 * also when the value is null or undefined.
 */
export const SecretMetadataSchema = z.preprocess(
  (value) => {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      return [value];
    }
    return value;
  },
  z.array(
    z.object({
      key: z.string().describe('The key of the secret metadata'),
      value: z.string().describe('The value of the secret metadata')
    })
  )
);

export type Client = z.infer<typeof ClientSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type SecretMetadata = z.infer<typeof SecretMetadataSchema>;
