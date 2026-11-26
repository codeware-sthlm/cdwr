import { z } from 'zod';

import { AppsCreateTransformedResponseSchema } from './schemas/apps-create.schema';
import { AppsListTransformedResponseSchema } from './schemas/apps-list.schema';
import { BuildResponseSchema } from './schemas/build-response.schema';
import { CertsListWithAppTransformedResponseSchema } from './schemas/certs-list-with-app.schema';
import { CertsListTransformedResponseSchema } from './schemas/certs-list.schema';
import { ConfigShowResponseSchema } from './schemas/config-show.schema';
import { DeployResponseSchema } from './schemas/deploy.schema';
import { IpsListTransformedResponseSchema } from './schemas/ips-list.schema';
import { PostgresListTransformedResponseSchema } from './schemas/postgres-list';
import { PostgresUsersListTransformedResponseSchema } from './schemas/postgres-users-list';
import { SecretsListWithAppTransformedResponseSchema } from './schemas/secrets-list-with-app.schema';
import { SecretsListTransformedResponseSchema } from './schemas/secrets-list.schema';
import { StatusTransformedResponseSchema } from './schemas/status.schema';
import { VersionTransformedResponseSchema } from './schemas/version.schema';

/** List applications */
export type ListAppResponse = z.infer<typeof AppsListTransformedResponseSchema>;

/** Create an application */
export type CreateAppResponse = z.infer<
  typeof AppsCreateTransformedResponseSchema
>;

/** Build application image response */
export type BuildResponse = z.infer<typeof BuildResponseSchema>;

/** Deploy application response */
export type DeployResponse = z.infer<typeof DeployResponseSchema>;

/** List certificates for an application */
export type ListCertForAppResponse = z.infer<
  typeof CertsListTransformedResponseSchema
>;

/** List public IP addresses for an application */
export type ListIpResponse = z.infer<typeof IpsListTransformedResponseSchema>;

/**
 * Which public addresses to allocate.
 *
 * Both defaults are free. A dedicated v4 is billed, which is why it is not
 * offered here — `sharedV4` is what an app with an `http_service` needs.
 */
export type AllocateIpOptions = AppOrConfig & {
  /** Allocate a free shared IPv4 @default true */
  sharedV4?: boolean;
  /** Allocate a free dedicated IPv6 @default true */
  v6?: boolean;
};

/** List certificates for all applications */
export type ListCertForAllResponse = z.infer<
  typeof CertsListWithAppTransformedResponseSchema
>;

/** List secrets for an application */
export type ListSecretForAppResponse = z.infer<
  typeof SecretsListTransformedResponseSchema
>;

/** List secrets for all applications */
export type ListSecretForAllResponse = z.infer<
  typeof SecretsListWithAppTransformedResponseSchema
>;

/** List postgres databases */
export type ListPostgresResponse = z.infer<
  typeof PostgresListTransformedResponseSchema
>;

/** `ListPostgresResponse` without the string option */
export type ListPostgresResponseWithoutString = Exclude<
  ListPostgresResponse,
  string
>;

/** List users for a postgres database application */
export type ListPostgresUsersResponse = z.infer<
  typeof PostgresUsersListTransformedResponseSchema
>;

/** Show application configuration */
export type ShowConfigResponse = z.infer<typeof ConfigShowResponseSchema>;

/** Get the status of an application */
export type StatusResponse = z.infer<typeof StatusTransformedResponseSchema>;

/** Get the version information of the Fly CLI */
export type VersionResponse = z.infer<typeof VersionTransformedResponseSchema>;

/**
 * Configuration options for the Fly class.
 */
export type Config = {
  /**
   * Authenticate using a Fly token.
   *
   * Fall back to environment variables `FLY_ACCESS_TOKEN` or `FLY_API_TOKEN`.
   */
  token?: string;

  /**
   * The target organisation for your apps.
   *
   * Defaults to your personal organisation.
   */
  org?: string;

  /**
   * The target region for your apps.
   *
   * Defaults to auto-detect the fastest location.
   */
  region?: string;

  /**
   * Customize the logging behaviour.
   */
  logger?: Partial<Logger>;
} & (
  | {
      /**
       * Name of the application to initiate commands on.
       *
       * Use it when your current workspace doesn't have a fly configuration file
       * or you want to target a different application.
       *
       * Defaults to the application defined in `fly.toml` in the current workspace.
       */
      app?: string;
    }
  | {
      /**
       * Path to the fly configuration file to initiate commands on.
       *
       * Use it when your current workspace doesn't have a fly configuration file.
       */
      config?: string;
    }
);

/**
 * Options for initiating commands
 * where the application or configuration is optional
 */
export type AppOrConfig =
  | {
      /**
       * Name of the application.
       *
       * Defaults to the application in the class configuration.
       */
      app?: string;
    }
  | {
      /**
       * Path to the fly configuration file.
       *
       * Defaults to the file in the class configuration.
       */
      config?: string;
    };

/**
 * Options for creating an application
 */
export type CreateAppOptions = {
  /**
   * Name of the application to create.
   *
   * Defaults to a generated name.
   */
  app?: string;

  /**
   * Target organisation for your app.
   *
   * Defaults to the organisation in the class configuration.
   */
  org?: string;
};

/**
 * Options for destroying an application
 */
export type DestroyAppOptions = {
  /**
   * Destroy the application even when detaching it from a Postgres cluster fails.
   *
   * Each failed detach is logged and returned in `detachFailures`.
   * A failed destroy still throws.
   *
   * @default false
   */
  allowDetachFailure?: boolean;
};

/**
 * Result of destroying an application
 */
export type DestroyAppResponse = {
  /**
   * Postgres clusters that could not be detached before the application was destroyed.
   *
   * Always empty unless `allowDetachFailure` is set, since a failed detach throws.
   */
  detachFailures: Array<{ cluster: string; error: string }>;
};

/**
 * Options for deploying an application
 */
export type DeployAppOptions = {
  /**
   * Name of the application to deploy.
   *
   * This name can be different from what's defined in the `fly.toml` file.
   * You can for example deploy to a new application but reuse a blueprint.
   *
   * Defaults to the class configuration app or config app, or the app defined in `fly.toml` in the current workspace.
   */
  app?: string;

  /**
   * Path to the `fly.toml` file to deploy.
   *
   * Defaults to the class configuration or the `fly.toml` in the working directory.
   */
  config?: string;

  /**
   * Environment variables to set for the application.
   *
   * Spaces are supported in values.
   */
  env?: Record<string, string>;

  /**
   * Build arguments to pass to the Docker build.
   *
   * These are available during the build phase (e.g. NEXT_PUBLIC_ vars, etc.).
   * Use `env` for runtime environment variables instead.
   */
  buildArgs?: Record<string, string>;

  /**
   * Target environment for the application.
   *
   * Environment variable `DEPLOY_ENV` will be set to the provided value.
   *
   * _Typical values for a preview environment can be `'staging'`, `'testing'`, `'development'`, `'preview'`, `'review'`, etc.
   * This is up to the developer to choose._
   */
  environment?: string;

  /**
   * Target organisation for the application.
   *
   * Only used when a new application must be created.
   * Defaults to the organisation in the class configuration.
   */
  org?: string;

  /**
   * Attach to a Postgres database application.
   *
   * Connection details will be provided via environment variable `DATABASE_URL`.
   */
  postgres?: string;

  /**
   * Database name to use when attaching to Postgres.
   *
   * If not specified, Fly will create a database with a default name.
   * Use this to ensure multiple apps share the same database.
   */
  databaseName?: string;

  /**
   * Target region for the application.
   *
   * Defaults to the region in the class configuration.
   */
  region?: string;

  /**
   * Secrets to set for the application.
   *
   * Spaces are supported in values.
   */
  secrets?: Record<string, string>;

  /**
   * Docker image to use for deployment.
   *
   * This allows deploying with an existing image instead of rebuilding.
   * Useful for config-only updates where you want to reuse the current image.
   *
   * Format: Can be either a full image reference (e.g., `registry.fly.io/app:tag`)
   * or just the image tag from the registry (the shorthand will be expanded to the full reference).
   *
   * When provided, the build phase is skipped and the deployment uses the specified image.
   */
  image?: string;

  /**
   * Build the image and push it to the registry without deploying.
   *
   * Use this to separate the build phase from the deploy phase.
   * The image reference is returned and can be passed to a subsequent
   * deploy call via the `image` option to skip rebuilding.
   *
   * Defaults to `false`.
   */
  buildOnly?: boolean;

  /**
   * Whether to opt out of the Depot Builder.
   *
   * Defaults to `false`.
   */
  optOutDepotBuilder?: boolean;

  /**
   * Whether to prefer remote configuration for existing apps.
   *
   * When enabled and the app already exists on Fly:
   * - Saves the remote configuration locally to `{app-root}/fly.{app-name}.toml`
   * - Uses the remote config for deployment
   *
   * When disabled or the app doesn't exist:
   * - Uses the local config file specified in the `config` option
   *
   * Defaults to `false`.
   */
  preferRemoteConfig?: boolean;
};

/**
 * Options for showing an application's configuration
 */
export type ShowConfigOptions =
  | {
      /**
       * Name of the application to show the remote configuration for.
       */
      app?: string;
    }
  | {
      /**
       * Path to a `fly.toml` file to extract the application name from.
       *
       * The configuration will be fetched from the application on remote.
       */
      config?: string;

      /**
       * Whether to show the local `fly.toml` file instead of the remote configuration.
       *
       * Use this option when the application is not deployed yet.
       *
       * Defaults to `false`.
       */
      local?: boolean;
    };

/**
 * Options for saving an application's configuration to a local file
 */
export type SaveConfigOptions = {
  /**
   * Name of the application to save the remote configuration for.
   */
  app: string;

  /**
   * Path to save the configuration file to.
   *
   * The format is read from this path's extension — `.json` and `.yaml`/
   * `.yml` request that output from flyctl explicitly, anything else saves
   * as TOML.
   */
  config: string;
};

/**
 * Options for setting application secrets
 */
export type SetAppSecretsOptions = AppOrConfig & {
  /**
   * Whether to only stage the secrets and skip the deployment.
   */
  stage?: boolean;
};

/**
 * Options for unsetting application secrets
 */
export type UnsetAppSecretsOptions = SetAppSecretsOptions;

/**
 * Options for machine operations (start, stop, restart)
 */
export type MachineOperationOptions = {
  /**
   * Name of the application
   */
  app: string;

  /**
   * Machine ID to perform the operation on
   */
  machineId: string;
};

/**
 * Extended application status
 */
export type StatusExtendedResponse = StatusResponse & {
  domains: Array<Pick<ListCertForAppResponse[number], 'hostname'>>;
  secrets: Array<Pick<ListSecretForAppResponse[number], 'name'>>;
};

/**
 * Logger interface using the `console` signature
 */
export type Logger = {
  /**
   * Log informational messages function.
   *
   * Defaults to `console.log`.
   */
  info: typeof console.log;

  /**
   * Log error messages function.
   *
   * Defaults to `console.error`.
   */
  error: typeof console.error;

  /**
   * Whether to trace the `flyctl` CLI commands.
   *
   * Logs the Fly CLI commands being called and the returned results
   * with special formatting for better readability.
   *
   * It's useful for debugging the CLI commands or just to see what's happening under the hood.
   *
   * Errors are most likely to be unknown application names or missing configuration files
   * that are hidden from the user by the library.
   *
   * Defaults to `false`.
   *
   * @example
   *
   * ```sh
   * # success
   * [ CALL ] flyctl auth whoami
   * [RESULT] auth@user.io
   * [ CALL ] flyctl certs list --app demo-app --json
   * [RESULT] [
   *   {
   *     "CreatedAt": "2022-11-20T22:36:46Z",
   *     "Hostname": "*.demo-app.io",
   *     "ClientStatus": "Ready"
   *   },
   * ]
   *
   * # error
   * [ CALL ] flyctl status --config apps/demo-app/fly.toml --json
   * [RESULT] Error: Command failed: flyctl status --config apps/demo-app/fly.toml --json
   * Error: the config for your app is missing an app name, add an app field to the fly.toml file or specify with the -a flag
   * ```
   */
  traceCLI: boolean;

  /**
   * Enable verbose output for Fly CLI commands (e.g., Docker build logs)
   *
   * When enabled, adds `--verbose` flag to commands.
   *
   * @default false
   */
  verbose: boolean;

  /**
   * Enable debug output for Fly CLI commands
   *
   * When enabled, adds `--debug` flag to commands for detailed debugging information.
   *
   * @default false
   */
  debug: boolean;

  /**
   * Stream command output to console in real-time
   *
   * When enabled, stdout and stderr are piped to the console in real-time
   * while still being captured for JSON parsing and result processing.
   * Useful for long-running commands like deployments where you want to see progress.
   *
   * Works independently from `traceCLI`, `verbose`, and `debug`.
   *
   * @default false
   */
  streamToConsole: boolean;

  /**
   * Redact sensitive call values in CLI trace logs.
   *
   * When enabled, secrets and tokens are masked:
   * - Values > 10 chars: first 3 + [REDACTED] + last 3 (e.g., "foo[REDACTED]bar")
   * - Values ≤ 10 chars: [REDACTED]
   *
   * Redacts:
   * - `secrets set KEY1=VALUE1 KEY2=VALUE2 ...`
   *
   * Only applies when `traceCLI` is `true`.
   *
   * @default true
   *
   * @example
   *
   * ```ts
   * const fly = new Fly({
   *   logger: {
   *     traceCLI: true,
   *     redactSecrets: true
   *   }
   * });
   * ```
   *
   * @example
   *
   * ```sh
   * # Without redaction:
   * [ CALL ] flyctl secrets set API_KEY=secret!
   *
   * # With redaction:
   * [ CALL ] flyctl secrets set API_KEY=[REDACTED]
   * ```
   */
  redactSecrets?: boolean;
};
