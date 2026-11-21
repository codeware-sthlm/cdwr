import { z } from 'zod';

const ResolvedGithubConfigSchema = z.object({
  flyPostgresPreview: z.string().nullish(),
  flyPostgresProduction: z.string().nullish(),
  flyPostgresDatabaseName: z.string().nullish(),
  sharedSecrets: z.boolean().nullish()
});

/**
 * Sentry wiring for a single app. Projects map one-to-one to apps, never to
 * tenants — tenants are separated by a runtime tag within the shared project.
 */
export const AppSentrySchema = z.object({
  /** Sentry project slug, resolved from Infisical by the pre-deploy action */
  project: z.string(),
  /** DSN of that project, resolved from Infisical by the pre-deploy action */
  dsn: z.string(),
  /**
   * Release identifier `name@version+sha`. Resolved by the build workflow once
   * the app manifests have been versioned, so it is absent until then.
   */
  release: z.string().optional()
});

export type AppSentry = z.infer<typeof AppSentrySchema>;

export const DeployableAppSchema = z.object({
  name: z.string(),
  flyConfigFile: z.string(),
  githubConfig: ResolvedGithubConfigSchema,
  /**
   * Version this deployment releases the app as, resolved by `nx release` from
   * the app's conventional commits. Stamped into the manifest before the image
   * is built, and tagged once the deployment succeeds.
   */
  version: z.string(),
  /**
   * Version the app was last released as — where its changelog range starts.
   * Carried from pre-deploy because it is unrecoverable once the new tag is
   * pushed: nx would then resolve that tag as the current version.
   */
  previousVersion: z.string(),
  /** Absent when the app has no Sentry configuration, which disables Sentry */
  sentry: AppSentrySchema.optional()
});

export type DeployableApp = z.infer<typeof DeployableAppSchema>;
