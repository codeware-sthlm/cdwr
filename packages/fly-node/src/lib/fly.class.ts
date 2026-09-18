import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { cwd } from 'process';

import {
  SpawnOptions,
  SpawnPtyOptions,
  spawn,
  spawnPty
} from '@codeware/shared/util/misc';
import { ZodError } from 'zod';

import { AppsCreateTransformedResponseSchema } from './schemas/apps-create.schema';
import { AppsListTransformedResponseSchema } from './schemas/apps-list.schema';
import { BuildResponseSchema } from './schemas/build-response.schema';
import { CertsListWithAppTransformedResponseSchema } from './schemas/certs-list-with-app.schema';
import { CertsListTransformedResponseSchema } from './schemas/certs-list.schema';
import { ConfigShowResponseSchema } from './schemas/config-show.schema';
import { DeployResponseSchema } from './schemas/deploy.schema';
import { NameSchema } from './schemas/helper-schemas';
import { IpsListTransformedResponseSchema } from './schemas/ips-list.schema';
import { PostgresListTransformedResponseSchema } from './schemas/postgres-list';
import { PostgresUsersListTransformedResponseSchema } from './schemas/postgres-users-list';
import { SecretsListWithAppTransformedResponseSchema } from './schemas/secrets-list-with-app.schema';
import { SecretsListTransformedResponseSchema } from './schemas/secrets-list.schema';
import { StatusExtendedTransformedResponseSchema } from './schemas/status-extended.schema';
import { StatusTransformedResponseSchema } from './schemas/status.schema';
import { VersionTransformedResponseSchema } from './schemas/version.schema';
import type {
  AllocateIpOptions,
  AppOrConfig,
  BuildResponse,
  Config,
  CreateAppOptions,
  CreateAppResponse,
  DeployAppOptions,
  DeployResponse,
  ListAppResponse,
  ListCertForAllResponse,
  ListCertForAppResponse,
  ListIpResponse,
  ListPostgresResponseWithoutString,
  ListPostgresUsersResponse,
  ListSecretForAllResponse,
  ListSecretForAppResponse,
  Logger,
  SaveConfigOptions,
  SetAppSecretsOptions,
  ShowConfigOptions,
  ShowConfigResponse,
  StatusExtendedResponse,
  StatusResponse,
  UnsetAppSecretsOptions,
  VersionResponse
} from './types';

export type ExecFlyOptions = SpawnOptions &
  SpawnPtyOptions & {
    /**
     * How to assemble the returned output string from the spawned process.
     * - `'stdout'` (default): return stdout only — correct for JSON and most text commands
     * - `'stderr'`: return stderr only
     * - `'combined'`: return stdout + stderr — use when the data of interest
     *   may appear in either stream (e.g. `fly deploy --build-only`)
     */
    streamStrategy?: 'stdout' | 'stderr' | 'combined';
  };

/**
 * Manages deployments to Fly.io using the `flyctl` CLI tool.
 */
export class Fly {
  /** Use underscore to avoid conflict with public `config` property */
  private _config: Config;
  private initialized = false;
  private logger: Logger;

  /**
   * Get the app name from the instance config
   */
  private get instanceApp(): string {
    if ('app' in this._config) {
      return this._config.app ?? '';
    }
    return '';
  }
  /**
   * Get the config file path from the instance config
   */
  private get instanceConfig(): string {
    if ('config' in this._config) {
      return this._config.config ?? '';
    }
    return '';
  }

  constructor(config?: Config) {
    this._config = config || {};
    this.logger = {
      info: config?.logger?.info || console.log,
      error: config?.logger?.error || console.error,
      traceCLI: config?.logger?.traceCLI ?? false,
      redactSecrets: config?.logger?.redactSecrets ?? true,
      verbose: config?.logger?.verbose ?? false,
      debug: config?.logger?.debug ?? false,
      streamToConsole: config?.logger?.streamToConsole ?? false
    };

    // Override FLY_ACCESS_TOKEN environment variable when token is provided
    if (this._config.token) {
      process.env['FLY_ACCESS_TOKEN'] = this._config.token;
    }
  }

  /**
   * Verify that the Fly client is ready to use.
   *
   * This means that the Fly CLI is installed and authenticated to Fly.io.
   *
   * Use as ad-hoc check when needed instead of waiting for the first Fly command to run.
   *
   * @param mode - Whether to use assertion mode instead of returning `false`
   * @returns `true` if the Fly client is ready, `false` otherwise
   * @throws An error in assertion mode if the Fly client is not ready
   */
  async isReady(mode?: 'assert'): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch (error) {
      if (mode === 'assert') {
        throw error;
      }
      this.logger.info(`Fly client is not ready\n${error}`);
      return false;
    }
  }

  /**
   * Manage the Fly CLI tool
   */
  cli = {
    /**
     * Check if the Fly CLI tool is installed
     *
     * @returns `true` if the Fly CLI tool is installed, `false` otherwise
     */
    isInstalled: async (): Promise<boolean> => await this.isInstalled(),

    /**
     * Get version information about the installed Fly CLI
     *
     * @returns The installed Fly CLI version information
     * @throws An error if the version cannot be retrieved
     */
    version: async (): Promise<VersionResponse> => {
      try {
        return await this.version();
      } catch (error) {
        throw new Error(`[version] something broke\n${error}`);
      }
    }
  };

  //
  // External API following the `flyctl` CLI commands structure
  //

  /**
   * Manage apps
   */
  apps = {
    /**
     * Create a new application with a generated name when not provided.
     *
     * @param options - Options for creating an application
     * @returns The name of the created application
     * @throws An error if the application cannot be created
     */
    create: async (options?: CreateAppOptions): Promise<CreateAppResponse> => {
      try {
        await this.ensureInitialized();
        const response = await this.createApp(options);
        this.logger.info(`Application '${response.name}' was created`);
        return response;
      } catch (error) {
        throw new Error(
          `[create app] something broke, check your apps\n${error}`
        );
      }
    },
    /**
     * Destroy an application and make sure it gets detached from any Postgres clusters
     *
     * @param app - The name of the app to destroy
     * @throws An error if the app cannot be destroyed
     */
    destroy: async (app: string): Promise<void> => {
      try {
        await this.ensureInitialized();
        // First any Postgres clusters must be detached
        const attachedClusters = await this.getAttachedPostgresClusters(app);
        for (const cluster of attachedClusters) {
          this.logger.info(
            `Detaching Postgres cluster '${cluster}' from application '${app}'`
          );
          const output = await this.detachPostgres(cluster, app);
          this.logger.info(output);
        }
        // Now it's safe to destroy the app
        await this.destroyApp(app);
        this.logger.info(`Application '${app}' was destroyed`);
      } catch (error) {
        throw new Error(
          `[destroy app] something broke, check your apps\n${error}`
        );
      }
    },
    /**
     * List all applications
     *
     * @returns A list of applications
     * @throws An error if listing applications fails
     */
    list: async (): Promise<ListAppResponse> => {
      try {
        return await this.fetchAllApps('throwOnError');
      } catch (error) {
        throw new Error(`[list] something broke\n${error}`);
      }
    }
  };
  /**
   * Manage certificates
   */
  certs = {
    /**
     * Add a certificate for a domain to an application
     *
     * @param hostname - The hostname to add a certificate for
     * @param options - Options for adding a certificate
     * @throws An error if the certificate cannot be added
     */
    add: async (hostname: string, options?: AppOrConfig): Promise<void> => {
      try {
        await this.ensureInitialized();
        const appName = await this.addAppCertificate(hostname, options);
        this.logger.info(
          `Certificate for domain '${hostname}' was added to '${appName}'`
        );
      } catch (error) {
        throw new Error(
          `[add certificate] something broke, check your app certificates\n${error}`
        );
      }
    },
    /**
     * List certificates for an application
     *
     * @param options - List certificates for an application or all certificates
     * @returns A list of certificates
     * @throws An error if listing certificates fails
     */
    list: async <T extends AppOrConfig | 'all'>(
      options?: T
    ): Promise<
      T extends 'all' ? ListCertForAllResponse : ListCertForAppResponse
    > => {
      try {
        await this.ensureInitialized();

        // Note!
        // A typesafe pattern to let us keep object literals with methods, with great DX,
        // but which also prevents us from using functions overload.
        const result =
          options === 'all'
            ? await this.fetchAllCerts('throwOnError')
            : await this.fetchAppCerts('throwOnError', options);

        return result as T extends 'all'
          ? ListCertForAllResponse
          : ListCertForAppResponse;
      } catch (error) {
        throw new Error(`[list certificates] something broke\n${error}`);
      }
    },
    /**
     * Remove a certificate for a domain from an application
     *
     * @param hostname - The hostname to remove a certificate for
     * @param options - Options for removing a certificate
     * @throws An error if the certificate cannot be removed
     */
    remove: async (hostname: string, options?: AppOrConfig): Promise<void> => {
      try {
        await this.ensureInitialized();
        const appName = await this.removeAppCertificate(hostname, options);
        this.logger.info(
          `Certificate for domain '${hostname}' was removed from '${appName}'`
        );
      } catch (error) {
        throw new Error(
          `[remove certificate] something broke, check your app certificates\n${error}`
        );
      }
    }
  };
  /**
   * Manage an app's configuration
   */
  config = {
    /**
     * Save an application's remote configuration locally.
     *
     * TOML by default; name the path `.json` or `.yaml`/`.yml` for either of
     * those instead.
     *
     * @param options - Options for saving an application's configuration
     * @throws An error if the configuration cannot be saved
     */
    save: async (options: SaveConfigOptions): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.saveConfig(options);
        this.logger.info(
          `Configuration for '${options.app}' was saved to '${options.config}'`
        );
      } catch (error) {
        throw new Error(`[save config] something broke\n${error}`);
      }
    },
    /**
     * Show an application's configuration.
     *
     * @param options - Options for showing an application's configuration
     * @returns The application's JSON configuration
     * @throws An error if the configuration cannot be found or parsed
     */
    show: async (options?: ShowConfigOptions): Promise<ShowConfigResponse> => {
      try {
        await this.ensureInitialized();
        return await this.showConfig('throwOnError', options);
      } catch (error) {
        throw new Error(`[show config] something broke\n${error}`);
      }
    }
  };
  /**
   * Deploy an application, or just build its Docker image without deploying when
   * `buildOnly` is set (equivalent to using `build(options)`).
   *
   * Pre-building is useful to ensure the image can be built successfully and exists
   * before running a deploy that depends on it, and also to get the image reference for use in
   * subsequent operations.
   *
   * A valid config file is required but the app doesn't have to exist,
   * since it gets created if needed.
   *
   * The app name is selected from:
   * 1. Provided app name
   * 2. Instance app name
   * 3. App name from the provided config file
   *
   * @param options - Deployment or build options
   * @returns Build or deploy response depending on `buildOnly` option
   * @throws An error if the operation fails
   */
  deploy = async <T extends DeployAppOptions>(
    options?: T
  ): Promise<
    T extends { buildOnly: true } ? BuildResponse : DeployResponse
  > => {
    const isBuildOnly = options?.buildOnly === true;

    try {
      await this.ensureInitialized();

      if (isBuildOnly) {
        const { appName, imageRef } = await this.deployApp({
          ...options,
          buildOnly: true
        });

        if (!imageRef) {
          throw new Error(
            'Build completed but image reference not found in output'
          );
        }

        this.logger.info(`Image for '${appName}' built: ${imageRef}`);

        return BuildResponseSchema.parse({ appName, imageRef }) as T extends {
          buildOnly: true;
        }
          ? BuildResponse
          : DeployResponse;
      }

      const { appName } = await this.deployApp(options);
      this.logger.info(`Application '${appName}' was deployed`);

      const status = await this.fetchAppStatus('throwOnError', {
        app: appName
      });

      return DeployResponseSchema.parse({
        app: status.name,
        hostname: status.hostname,
        url: `https://${status.hostname}`
      }) as T extends { buildOnly: true } ? BuildResponse : DeployResponse;
    } catch (error) {
      throw new Error(
        `[deploy] something broke, check your ${isBuildOnly ? 'builds' : 'deployments'}\n${error}`
      );
    }
  };

  /**
   * Manage public IP addresses
   */
  ips = {
    /**
     * List the public IP addresses allocated to an application
     *
     * @param options - The application or configuration to list addresses for
     * @returns The allocated addresses, empty when the app has none
     * @throws An error if listing addresses fails
     */
    list: async (options?: AppOrConfig): Promise<ListIpResponse> => {
      try {
        await this.ensureInitialized();
        return await this.fetchAppIps('throwOnError', options);
      } catch (error) {
        throw new Error(`[list ips] something broke\n${error}`);
      }
    },
    /**
     * Give an application the public addresses it needs to be reachable.
     *
     * Idempotent by inspection: it allocates only what is missing, so it is
     * safe on every deploy rather than only on create. That matters because
     * `flyctl` allocates addresses only for an app it creates itself — an app
     * that arrives any other way, such as a registry push auto-creating it,
     * deploys green and answers nothing.
     *
     * @param options - The application, and which addresses to ensure
     * @returns The addresses the application holds afterwards
     * @throws An error if an address cannot be allocated
     */
    ensure: async (options?: AllocateIpOptions): Promise<ListIpResponse> => {
      try {
        await this.ensureInitialized();

        const { sharedV4 = true, v6 = true } = options ?? {};
        const existing = await this.fetchAppIps('throwOnError', options);
        const has = (...types: Array<string>) =>
          existing.some((ip) => types.includes(ip.type));

        if (sharedV4 && !has('v4', 'shared_v4')) {
          await this.allocateIp('allocate-v4', options);
          this.logger.info('Allocated a shared IPv4 address');
        }
        if (v6 && !has('v6')) {
          await this.allocateIp('allocate-v6', options);
          this.logger.info('Allocated a dedicated IPv6 address');
        }

        return await this.fetchAppIps('throwOnError', options);
      } catch (error) {
        throw new Error(
          `[ensure ips] something broke, check your app addresses\n${error}`
        );
      }
    }
  };

  /**
   * Manage machines
   */
  machines = {
    /**
     * Start a machine
     *
     * @param app - The name of the application
     * @param machineId - The machine ID to start
     * @throws An error if the machine cannot be started
     */
    start: async (app: string, machineId: string): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.startMachine(app, machineId);
        this.logger.info(`Machine '${machineId}' in app '${app}' was started`);
      } catch (error) {
        throw new Error(`[start machine] something broke\n${error}`);
      }
    },
    /**
     * Stop a machine
     *
     * @param app - The name of the application
     * @param machineId - The machine ID to stop
     * @throws An error if the machine cannot be stopped
     */
    stop: async (app: string, machineId: string): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.stopMachine(app, machineId);
        this.logger.info(`Machine '${machineId}' in app '${app}' was stopped`);
      } catch (error) {
        throw new Error(`[stop machine] something broke\n${error}`);
      }
    },
    /**
     * Restart a machine by stopping then starting it
     *
     * @param app - The name of the application
     * @param machineId - The machine ID to restart
     * @throws An error if the machine cannot be restarted
     */
    restart: async (app: string, machineId: string): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.restartMachine(app, machineId);
        this.logger.info(
          `Machine '${machineId}' in app '${app}' was restarted`
        );
      } catch (error) {
        throw new Error(`[restart machine] something broke\n${error}`);
      }
    },
    /**
     * Update a machine's per-machine configuration (env vars, etc.).
     *
     * Unlike `restart`, this creates a new machine version from the updated config
     * and forces a cold start — it does NOT resume from a suspended memory snapshot.
     *
     * @param app - The name of the application
     * @param machineId - The machine ID to update
     * @param options - Fields to update; env values set to `''` clear that var
     * @throws An error if the machine cannot be updated
     */
    update: async (
      app: string,
      machineId: string,
      options: { env?: Record<string, string> }
    ): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.updateMachine(app, machineId, options);
        this.logger.info(`Machine '${machineId}' in app '${app}' was updated`);
      } catch (error) {
        throw new Error(`[update machine] something broke\n${error}`);
      }
    }
  };
  postgres = {
    detach: async (cluster: string, app: string) => {
      await this.detachPostgres(cluster, app);
    }
  };
  /**
   * Run commands inside a running machine
   */
  ssh = {
    /**
     * Execute a command in a running machine and return its output.
     *
     * Requires a started machine - Fly cannot connect to a stopped or
     * suspended one. Use `machines.start` first when the app may be idle.
     *
     * The output is returned to the caller and not logged unless CLI tracing
     * is enabled, so it can be used to read values that are otherwise
     * write-only, such as secrets injected at deploy time.
     *
     * @param app - The name of the application
     * @param command - The command to run inside the machine
     * @returns The command output
     * @throws An error if there is no started machine or the command fails
     */
    exec: async (app: string, command: string): Promise<string> => {
      try {
        await this.ensureInitialized();
        return await this.sshExec(app, command);
      } catch (error) {
        throw new Error(`[ssh exec] something broke\n${error}`);
      }
    }
  };
  /**
   * Manage application secrets
   */
  secrets = {
    /**
     * Set secrets for an application
     *
     * @param secrets - The secrets to set
     * @param options - Options for setting secrets
     * @throws An error if the secrets cannot be set
     */
    set: async (
      secrets: Record<string, string>,
      options?: SetAppSecretsOptions
    ): Promise<void> => {
      try {
        await this.ensureInitialized();
        const appName = await this.setAppSecrets(secrets, options);
        const keys = Object.keys(secrets);
        this.logger.info(
          `Secrets were set for '${appName}': ${keys.join(', ')}`
        );
      } catch (error) {
        throw new Error(
          `[set secrets] something broke, check your app secrets\n${error}`
        );
      }
    },
    /**
     * Apply secrets that were staged with `set({ stage: true })`.
     *
     * Staging first and deploying afterwards lets a set of apps take a new
     * value together, instead of each restarting as its own secret is written.
     *
     * Fly needs a started machine to update, so an app whose machines are all
     * stopped or suspended has to be started before this will do anything.
     *
     * @param app - The name of the application
     * @throws An error if the staged secrets cannot be deployed
     */
    deploy: async (app: string): Promise<void> => {
      try {
        await this.ensureInitialized();
        await this.deployStagedSecrets(app);
        this.logger.info(`Staged secrets were deployed for '${app}'`);
      } catch (error) {
        throw new Error(`[deploy secrets] something broke\n${error}`);
      }
    },
    /**
     * List secrets for an application or all secrets when options is 'all'
     *
     * @param options - List secrets for an application or all secrets
     * @returns A list of secrets
     * @throws An error if listing secrets fails
     */
    list: async <T extends AppOrConfig | 'all'>(
      options?: T
    ): Promise<
      T extends 'all' ? ListSecretForAllResponse : ListSecretForAppResponse
    > => {
      try {
        await this.ensureInitialized();

        const result =
          options === 'all'
            ? await this.fetchAllSecrets('throwOnError')
            : await this.fetchAppSecrets('throwOnError', options);

        return result as T extends 'all'
          ? ListSecretForAllResponse
          : ListSecretForAppResponse;
      } catch (error) {
        throw new Error(`[list secrets] something broke\n${error}`);
      }
    },
    /**
     * Unset secrets for an application
     *
     * @param keys - The keys to unset
     * @param options - Options for unsetting secrets
     * @throws An error if the secrets cannot be unset
     */
    unset: async (
      keys: string | Array<string>,
      options?: UnsetAppSecretsOptions
    ): Promise<void> => {
      try {
        await this.ensureInitialized();

        const keysArray = Array.isArray(keys) ? keys : [keys];
        const appName = await this.unsetAppSecrets(keysArray, options);

        this.logger.info(
          `Secrets were unset for '${appName}': ${keysArray.join(', ')}`
        );
      } catch (error) {
        throw new Error(
          `[unset secrets] something broke, check your app secrets\n${error}`
        );
      }
    }
  };
  /**
   * Get the status details of an application
   *
   * @param options - Options for getting app status
   * @returns The app status, or `null` if an app could not be found
   */
  status = async (options?: AppOrConfig): Promise<StatusResponse | null> => {
    try {
      await this.ensureInitialized();

      const status = await this.fetchAppStatus('nullOnError', options);
      if (status === null) {
        return null;
      }
      return status;
    } catch (error) {
      this.logger.info(`[status] something broke\n${error}`);
      return null;
    }
  };

  //
  // DX friendly methods outside what Fly CLI provides
  //

  /**
   * Build a Docker image for an application and push it to the Fly registry
   * without deploying.
   *
   * The image reference is returned for use in a subsequent `deploy` that depends on it.
   *
   * Shorthand for `deploy({ ...options, buildOnly: true })`.
   *
   * @param options - Build options
   * @returns The app name and image reference for use in a subsequent `deploy`
   * @throws An error if the build fails or the image reference cannot be parsed
   */
  build = (
    options?: Omit<DeployAppOptions, 'buildOnly'>
  ): Promise<BuildResponse> => this.deploy({ ...options, buildOnly: true });

  /**
   * Get the extended details of an application
   *
   * @param options - Options for getting app details
   * @returns The app details, or `null` if an app could not be found
   */
  statusExtended = async (
    options?: AppOrConfig
  ): Promise<StatusExtendedResponse | null> => {
    try {
      await this.ensureInitialized();
      const status = await this.fetchAppStatus('nullOnError', options);
      if (status === null) {
        return null;
      }
      const certs = (await this.fetchAppCerts('nullOnError', options)) || [];
      const secrets =
        (await this.fetchAppSecrets('nullOnError', options)) || [];

      return StatusExtendedTransformedResponseSchema.parse({
        ...status,
        domains: certs.map(({ hostname }) => ({ hostname })),
        secrets: secrets.map(({ name }) => ({ name }))
      });
    } catch (error) {
      this.logger.info(`[status extended] something broke\n${error}`);
      return null;
    }
  };

  //
  // Private methods
  //

  /**
   * @private
   * A name will be generated when not provided.
   * @returns The name of the created application
   * @throws An error if the application cannot be created
   */
  private async createApp(
    options?: CreateAppOptions
  ): Promise<CreateAppResponse> {
    const args = ['apps', 'create'];

    args.push(options?.app || '--generate-name');
    args.push('--org', options?.org || this._config.org || 'personal');
    args.push('--json');

    return AppsCreateTransformedResponseSchema.parseAsync(
      await this.execFly(args)
    );
  }

  /**
   * @private
   * @returns The app name and optional image reference (only set when buildOnly is true)
   * @throws An error if the deployment fails
   */
  private async deployApp(
    options?: DeployAppOptions
  ): Promise<{ appName: string; imageRef?: string }> {
    let appName = '';
    let deployConfig = options?.config || this.instanceConfig;

    // For deployment to work there must be an app involved,
    // but the app name doesn't have to be in sync with the config file.
    // The `options` concept is by design targeting a single app,
    // except for deployment where the app name can be any value.

    let lookupApp = options?.app || this.instanceApp;
    // Lookup config from initial deploy config
    const lookupConfig = deployConfig;

    if (!lookupConfig) {
      throw new Error(
        'Fly config file must be provided to options or class instance, unable to deploy'
      );
    }

    // Lookup the required app config file
    const appConfig = await this.showConfig('nullOnError', {
      config: lookupConfig,
      local: true
    });
    if (!appConfig) {
      throw new Error(
        `Fly config file '${lookupConfig}' does not exist, unable to deploy`
      );
    }

    // Use provided app name or fall back to the app name from the config file
    if (!lookupApp) {
      lookupApp = appConfig.app;
    }

    // Lookup an existing app by name (appName indicates existence)
    if (lookupApp) {
      const status = await this.fetchAppStatus('nullOnError', {
        app: lookupApp
      });
      if (status) {
        this.logger.info(
          `Found existing application '${lookupApp}' as target for deployment`
        );
        appName = status.name;
      } else {
        this.logger.info(
          `Application '${lookupApp}' not found, try to create a new one with this name`
        );
      }
    }

    // If preferRemoteConfig is enabled and app exists, save and use remote config
    if (options?.preferRemoteConfig && appName) {
      const remoteConfigPath = join(
        dirname(lookupConfig),
        `fly.${appName}.toml`
      );
      try {
        await this.saveConfig({
          app: appName,
          config: remoteConfigPath
        });
        // Override deploy config to use the remote config
        deployConfig = remoteConfigPath;
        this.logger.info(
          `Using remote config for existing app '${appName}' (saved to ${remoteConfigPath})`
        );
      } catch (error) {
        this.logger.info(
          `Failed to save remote config, will use local config: ${error}`
        );
        // deployConfig remains as the original local config
      }
    }

    // At this point we assume a deployment will be made,
    // otherwise fly will tell us what went wrong
    if (!appName) {
      this.logger.info('Creating a new application...');
      const { name } = await this.createApp({
        app: lookupApp,
        org: options?.org
      });
      appName = name;
      this.logger.info(`Application '${appName}' was created`);
    } else {
      this.logger.info(`Updating existing application '${appName}'`);
    }
    // Validate app name before proceeding
    NameSchema.parse(appName);

    // Apply secrets to app before deployment. Skipped for build-only (secrets are runtime, not build-time).
    //
    // Every secret is staged, not only the ones the app is missing. A value
    // that changed where it is kept reaches a running app no other way, and
    // comparing names would drop exactly that case — a rotated key stays
    // rotated only in the store it came from. Staging costs no extra restart:
    // the deploy below is what applies them, and it replaces the machines
    // whatever their secrets say.
    if (!options?.buildOnly && options?.secrets) {
      // An empty value is a mistake upstream, never an instruction. A workflow
      // renders `KEY=${{ secrets.MISSING }}` as `KEY=`, and staging that would
      // blank a live secret — turning a renamed repository secret into an
      // outage. Clearing one is deliberate work: `fly secrets unset`.
      const staged: Record<string, string> = {};
      const empty: Array<string> = [];

      for (const [key, value] of Object.entries(options.secrets)) {
        if (value === '') {
          empty.push(key);
        } else {
          staged[key] = value;
        }
      }

      if (empty.length > 0) {
        this.logger.error(
          `Refusing to blank secrets with no value for '${appName}': ${empty.join(', ')}`
        );
      }

      const keys = Object.keys(staged);

      if (keys.length > 0) {
        this.logger.info(
          `Staging secrets for '${appName}': ${keys.join(', ')}`
        );
        await this.setAppSecrets(staged, {
          app: appName,
          stage: true
        });
      }
    }

    // Always use provided app name if it exists
    if (options?.app && options.app !== appName) {
      this.logger.info(
        `Using provided app name '${options.app}' instead of '${appName}'`
      );
      appName = options.app;
    }

    // Attach to Postgres cluster if provided and not already attached.
    // Skipped for build-only (Postgres is a runtime concern, not a build-time one).
    if (!options?.buildOnly && options?.postgres) {
      // Get connected apps
      const users = await this.fetchPostgresUsers(
        options.postgres,
        'nullOnError'
      );

      if (!users) {
        this.logger.error(
          `Failed to fetch users for Postgres cluster '${options.postgres}', unable to attach '${appName}'`
        );
      } else if (
        users.find((user) => user.username === appName.replace(/-/g, '_'))
      ) {
        this.logger.info(
          `Postgres cluster '${options.postgres}' already attached to '${appName}', skipping`
        );
      } else {
        this.logger.info(
          `Attach Postgres cluster '${options.postgres}' to '${appName}'${
            options.databaseName
              ? ` with database '${options.databaseName}'`
              : ''
          }`
        );
        await this.attachPostgres(
          options.postgres,
          appName,
          options.databaseName
        );
      }
    }

    // Deploy command
    const args = ['deploy', '--app', appName, '--config', deployConfig];

    if (options?.region) {
      args.push('--region', options.region);
    }
    if (options?.environment) {
      args.push('--env', `DEPLOY_ENV=${options.environment}`);
    }
    for (const [key, value] of Object.entries(options?.env || {})) {
      args.push('--env', `${key}=${this.safeArg(value)}`);
    }
    for (const [key, value] of Object.entries(options?.buildArgs || {})) {
      args.push('--build-arg', `${key}=${this.safeArg(value)}`);
    }
    if (options?.image) {
      args.push('--image', options.image);
    }
    if (options?.buildOnly) {
      args.push('--build-only', '--push');
    }
    if (options?.optOutDepotBuilder) {
      args.push('--depot=false');
    }
    args.push('--yes');

    this.logger.info(
      options?.buildOnly
        ? `Building image for '${appName}'...`
        : `Deploying '${appName}'...`
    );

    // flyctl writes progress output (including the image ref) to stderr for
    // --build-only, so use 'combined' strategy to search both streams.
    const output = await this.execFly<string>(
      args,
      options?.buildOnly ? { streamStrategy: 'combined' } : undefined
    );

    const imageRef = options?.buildOnly
      ? output?.match(/registry\.fly\.io\/\S+/)?.[0]
      : undefined;

    return { appName, imageRef };
  }

  /**
   * @private
   * @throws An error if the Postgres database cannot be attached
   */
  private async attachPostgres(
    postgres: string,
    app: string,
    databaseName?: string
  ): Promise<void> {
    const args = ['postgres', 'attach', postgres, '--app', app];

    if (databaseName) {
      args.push('--database-name', databaseName);
    }

    args.push('--yes');

    await this.execFly(args);
  }

  /**
   * @private
   * @throws An error if the app cannot be destroyed
   */
  private async destroyApp(app: string): Promise<void> {
    const args = ['apps', 'destroy', app, '--yes'];

    await this.execFly(args);
  }

  /**
   * @private
   * @returns Log output from the detach process
   * @throws An error if the Postgres database cannot be detached from an app
   */
  private async detachPostgres(postgres: string, app: string): Promise<string> {
    const args = ['postgres', 'detach', postgres, '--app', app];

    // Prompt for confirmation if the database name
    return await this.execFly<string>(args, {
      prompt: (output) => {
        if (output.match(/select .* detach/i)) {
          return app.replace(/-/g, '_');
        }
        return;
      }
    });
  }

  /**
   * @private
   * @returns The name of the application
   * @throws An error if the secrets cannot be set
   */
  private async setAppSecrets(
    secrets: Record<string, string>,
    options?: SetAppSecretsOptions
  ): Promise<string> {
    const status = await this.fetchAppStatus('throwOnError', options);

    const args = ['secrets', 'set'];

    args.push(...this.getAppOrConfigArgs(options));
    if (options?.stage) {
      args.push('--stage');
    }
    for (const [key, value] of Object.entries(secrets)) {
      args.push(`${key}=${this.safeArg(value)}`);
    }

    await this.execFly(args);

    return NameSchema.parse(status.name);
  }

  /**
   * @private
   * @returns The name of the application
   * @throws An error if the secrets cannot be unset
   */
  private async unsetAppSecrets(
    keys: Array<string>,
    options?: UnsetAppSecretsOptions
  ): Promise<string> {
    const status = await this.fetchAppStatus('throwOnError', options);

    const args = ['secrets', 'unset'];

    args.push(...this.getAppOrConfigArgs(options));
    if (options?.stage) {
      args.push('--stage');
    }
    args.push(...keys);

    await this.execFly(args);

    return NameSchema.parse(status.name);
  }

  /**
   * @private
   * @returns The name of the application
   * @throws An error if the domain cannot be added
   */
  private async addAppCertificate(
    hostname: string,
    options?: AppOrConfig
  ): Promise<string> {
    const status = await this.fetchAppStatus('throwOnError', options);

    const args = ['certs', 'add', hostname];

    args.push(...this.getAppOrConfigArgs(options));
    // TODO: Analyze output and create a schema for validation
    args.push('--json');

    await this.execFly(args);

    return NameSchema.parse(status.name);
  }

  /**
   * Allocate one public address.
   *
   * A dedicated v4 is billed, so the v4 path is always `--shared`.
   *
   * The two commands do not take the same flags: `allocate-v4` has `--yes`
   * because a dedicated v4 costs money and prompts, while `allocate-v6` is
   * free, never prompts, and rejects the flag outright with `unknown flag`.
   * The asymmetry is flyctl's, not ours — do not tidy it away.
   *
   * @private
   * @throws An error if the address cannot be allocated
   */
  private async allocateIp(
    command: 'allocate-v4' | 'allocate-v6',
    options?: AppOrConfig
  ): Promise<void> {
    const args = ['ips', command];

    if (command === 'allocate-v4') {
      args.push('--shared');
    }
    args.push(...this.getAppOrConfigArgs(options));
    if (command === 'allocate-v4') {
      args.push('--yes');
    }

    await this.execFly(args);
  }

  /**
   * @private
   * @returns The addresses for an app or `null` if they cannot be retrieved and `nullOnError` is used
   * @throws An error if the addresses cannot be retrieved and `throwOnError` is used
   */
  private async fetchAppIps(
    onError: 'throwOnError',
    options?: AppOrConfig
  ): Promise<ListIpResponse>;
  private async fetchAppIps(
    onError: 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListIpResponse | null>;
  private async fetchAppIps(
    onError: 'throwOnError' | 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListIpResponse | null> {
    const args = ['ips', 'list'];

    args.push(...this.getAppOrConfigArgs(options));
    args.push('--json');

    try {
      return await IpsListTransformedResponseSchema.parseAsync(
        await this.execFly(args)
      );
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns The name of the application
   * @throws An error if the domain cannot be removed
   */
  private async removeAppCertificate(
    hostname: string,
    options?: AppOrConfig
  ): Promise<string> {
    const status = await this.fetchAppStatus('throwOnError', options);

    const args = ['certs', 'remove', hostname];

    args.push(...this.getAppOrConfigArgs(options));
    args.push('--yes');

    await this.execFly(args);

    return NameSchema.parse(status.name);
  }

  /**
   * @private
   * Deploy secrets previously staged for an application
   * @throws An error if the staged secrets cannot be deployed
   */
  private async deployStagedSecrets(app: string): Promise<void> {
    const args = ['secrets', 'deploy', '--app', app];
    await this.execFly(args);
  }

  /**
   * @private
   * Execute a command inside a running machine
   * @returns The command output
   * @throws An error if the command fails
   */
  private async sshExec(app: string, command: string): Promise<string> {
    const args = ['ssh', 'console', '--app', app, '--command', command];
    return await this.execFly<string>(args);
  }

  /**
   * @private
   * Start a machine
   * @throws An error if the machine cannot be started
   */
  private async startMachine(app: string, machineId: string): Promise<void> {
    const args = ['machine', 'start', machineId, '--app', app];
    await this.execFly(args);
  }

  /**
   * @private
   * Stop a machine
   * @throws An error if the machine cannot be stopped
   */
  private async stopMachine(app: string, machineId: string): Promise<void> {
    const args = ['machine', 'stop', machineId, '--app', app];
    await this.execFly(args);
  }

  /**
   * @private
   * Restart a machine by stopping then starting it
   * @throws An error if the machine cannot be restarted
   */
  private async restartMachine(app: string, machineId: string): Promise<void> {
    await this.stopMachine(app, machineId);
    // Wait a bit for the machine to fully stop
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.startMachine(app, machineId);
  }

  /**
   * @private
   * Update a machine's per-machine config (env vars, etc.).
   * Creates a new machine version so the machine cold-starts from the updated config,
   * bypassing any suspended memory snapshot.
   * @throws An error if the machine cannot be updated
   */
  private async updateMachine(
    app: string,
    machineId: string,
    options: { env?: Record<string, string> }
  ): Promise<void> {
    const args = ['machine', 'update', machineId, '--app', app];
    for (const [key, value] of Object.entries(options.env || {})) {
      args.push('--env', `${key}=${this.safeArg(value)}`);
    }
    args.push('--yes');
    await this.execFly(args);
  }

  /**
   * @private
   * @returns A list of all applications or `null` if listing applications fails and `nullOnError` is used
   * @throws An error if listing applications fails and `throwOnError` is used
   */
  private async fetchAllApps(onError: 'throwOnError'): Promise<ListAppResponse>;
  private async fetchAllApps(
    onError: 'nullOnError'
  ): Promise<ListAppResponse | null>;
  private async fetchAllApps(
    onError: 'throwOnError' | 'nullOnError'
  ): Promise<ListAppResponse | null> {
    const args = ['apps', 'list', '--json'];

    try {
      return AppsListTransformedResponseSchema.parseAsync(
        await this.execFly(args)
      );
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns All certificates for all apps or `null` if the certificates cannot be retrieved and `nullOnError` is used
   * @throws An error if the certificates cannot be retrieved
   */
  private async fetchAllCerts(
    onError: 'throwOnError'
  ): Promise<ListCertForAllResponse>;
  private async fetchAllCerts(
    onError: 'nullOnError'
  ): Promise<ListCertForAllResponse | null>;
  private async fetchAllCerts(
    onError: 'throwOnError' | 'nullOnError'
  ): Promise<ListCertForAllResponse | null> {
    try {
      const certs: ListCertForAllResponse = [];

      // Merge the certs for all apps
      const apps = await this.fetchAllApps('throwOnError');

      for (const app of apps) {
        const appCerts = await this.fetchAppCerts('throwOnError', {
          app: app.name
        });
        certs.push(...appCerts.map((cert) => ({ ...cert, app: app.name })));
      }

      return CertsListWithAppTransformedResponseSchema.parse(certs);
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns All postgres clusters or `null` if the clusters cannot be retrieved and `nullOnError` is used
   * @throws An error if the clusters cannot be retrieved
   */
  private async fetchAllPostgres(
    onError: 'throwOnError'
  ): Promise<ListPostgresResponseWithoutString>;
  private async fetchAllPostgres(
    onError: 'nullOnError'
  ): Promise<ListPostgresResponseWithoutString | null>;
  private async fetchAllPostgres(
    onError: 'throwOnError' | 'nullOnError'
  ): Promise<ListPostgresResponseWithoutString | null> {
    const args = ['postgres', 'list', '--json'];

    try {
      const response = await this.execFly(args);
      // Must handle string response as it means no clusters exist
      const parsed = PostgresListTransformedResponseSchema.safeParse(response);
      if (parsed.success) {
        return Array.isArray(parsed.data) ? parsed.data : [];
      }
      throw parsed.error;
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns All secrets for all apps or `null` if the secrets cannot be retrieved and `nullOnError` is used
   * @throws An error if the secrets cannot be retrieved
   */
  private async fetchAllSecrets(
    onError: 'throwOnError'
  ): Promise<ListSecretForAllResponse>;
  private async fetchAllSecrets(
    onError: 'nullOnError'
  ): Promise<ListSecretForAllResponse | null>;
  private async fetchAllSecrets(
    onError: 'throwOnError' | 'nullOnError'
  ): Promise<ListSecretForAllResponse | null> {
    try {
      const secrets: ListSecretForAllResponse = [];

      // Merge the secrets for all apps
      const apps = await this.fetchAllApps('throwOnError');

      for (const app of apps) {
        const appSecrets = await this.fetchAppSecrets('throwOnError', {
          app: app.name
        });
        secrets.push(
          ...appSecrets.map((secret) => ({ ...secret, app: app.name }))
        );
      }

      return SecretsListWithAppTransformedResponseSchema.parse(secrets);
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns The app status or `null` if the app cannot be found and `nullOnError` is used
   * @throws An error if the app cannot be found and `throwOnError` is used
   */
  private async fetchAppStatus(
    onError: 'throwOnError',
    options?: AppOrConfig
  ): Promise<StatusResponse>;
  private async fetchAppStatus(
    onError: 'nullOnError',
    options?: AppOrConfig
  ): Promise<StatusResponse | null>;
  private async fetchAppStatus(
    onError: 'throwOnError' | 'nullOnError',
    options?: AppOrConfig
  ): Promise<StatusResponse | null> {
    const args = ['status'];

    args.push(...this.getAppOrConfigArgs(options));
    args.push('--json');

    let response: StatusResponse | null = null;
    try {
      response = await this.execFly<StatusResponse>(args);
      return StatusTransformedResponseSchema.parse(response);
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      if (error instanceof ZodError) {
        this.logger.info(`Failed to parse response:
${error.message}`);
        this.logger.info(`Raw response:
${JSON.stringify(response, null, 2)}`);
      }
      return null;
    }
  }

  /**
   * @private
   * @returns The certificates for an app or `null` if the certificates cannot be retrieved and `nullOnError` is used
   * @throws An error if the certificates cannot be retrieved and `throwOnError` is used
   */
  private async fetchAppCerts(
    onError: 'throwOnError',
    options?: AppOrConfig
  ): Promise<ListCertForAppResponse>;
  private async fetchAppCerts(
    onError: 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListCertForAppResponse | null>;
  private async fetchAppCerts(
    onError: 'throwOnError' | 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListCertForAppResponse | null> {
    const args = ['certs', 'list'];

    args.push(...this.getAppOrConfigArgs(options));
    args.push('--json');

    try {
      return CertsListTransformedResponseSchema.parseAsync(
        await this.execFly(args)
      );
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns The secrets for an app or `null` if the secrets cannot be retrieved and `nullOnError` is used
   * @throws An error if the secrets cannot be retrieved and `throwOnError` is used
   */
  private async fetchAppSecrets(
    onError: 'throwOnError',
    options?: AppOrConfig
  ): Promise<ListSecretForAppResponse>;
  private async fetchAppSecrets(
    onError: 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListSecretForAppResponse | null>;
  private async fetchAppSecrets(
    onError: 'throwOnError' | 'nullOnError',
    options?: AppOrConfig
  ): Promise<ListSecretForAppResponse | null> {
    const args = ['secrets', 'list'];

    args.push(...this.getAppOrConfigArgs(options));
    args.push('--json');

    try {
      return SecretsListTransformedResponseSchema.parseAsync(
        await this.execFly(args)
      );
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * **Important!** User/app names containing dashes are returned as underscores.
   *
   * @private
   * @returns The users for a postgres database app or `null` if the users cannot be retrieved and `nullOnError` is used
   * @throws An error if the users cannot be retrieved and `throwOnError` is used
   */
  private async fetchPostgresUsers(
    postgresApp: string,
    onError: 'throwOnError'
  ): Promise<ListPostgresUsersResponse>;
  private async fetchPostgresUsers(
    postgresApp: string,
    onError: 'nullOnError'
  ): Promise<ListPostgresUsersResponse | null>;
  private async fetchPostgresUsers(
    postgresApp: string,
    onError: 'throwOnError' | 'nullOnError'
  ): Promise<ListPostgresUsersResponse | null> {
    const args = ['postgres', 'users', 'list', '--app', postgresApp, '--json'];

    try {
      const users = await this.execFly(args);
      return PostgresUsersListTransformedResponseSchema.parse(users);
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * @returns The config or `null` if the config cannot be retrieved and `nullOnError` is used
   * @throws An error if the config cannot be retrieved and `throwOnError` is used
   */
  private async showConfig(
    onError: 'throwOnError',
    options?: ShowConfigOptions
  ): Promise<ShowConfigResponse>;
  private async showConfig(
    onError: 'nullOnError',
    options?: ShowConfigOptions
  ): Promise<ShowConfigResponse | null>;
  private async showConfig(
    onError: 'throwOnError' | 'nullOnError',
    options?: ShowConfigOptions
  ): Promise<ShowConfigResponse | null> {
    const normalized = this.normalizeOptions(options);
    const config = normalized.config || this.instanceConfig;

    // Check if the config file exists when a path is provided
    if (config && !existsSync(join(cwd(), config))) {
      throw new Error(`Config file '${config}' does not exist`);
    }

    // Get the config
    const args = ['config', 'show'];

    args.push(...this.getAppOrConfigArgs(options));
    if (options && 'local' in options && options.local) {
      args.push('--local');
    }

    try {
      return ConfigShowResponseSchema.parse(await this.execFly(args));
    } catch (error) {
      if (onError === 'throwOnError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * @private
   * Save remote config to a local file
   *
   * Two things flyctl expects that a first-time caller would not: the output
   * format is no longer sniffed from the path's extension — `--json`/`--yaml`
   * has to be passed, TOML being what is left over when neither is — and the
   * destination must already exist as a parseable file of that format, or
   * `flyctl` refuses to write to it at all, mistaking "does not exist yet"
   * for "path is wrong". A fresh, empty seed of the right shape satisfies
   * that read without affecting what gets written back over it.
   *
   * @throws An error if the config cannot be saved
   */
  private async saveConfig(options: SaveConfigOptions): Promise<void> {
    const isJson = options.config.endsWith('.json');
    const isYaml = /\.ya?ml$/.test(options.config);

    if (!existsSync(options.config)) {
      mkdirSync(dirname(options.config), { recursive: true });
      writeFileSync(options.config, isJson ? '{}' : '');
    }

    const args = [
      'config',
      'save',
      '--app',
      options.app,
      '--config',
      options.config,
      ...(isJson ? ['--json'] : isYaml ? ['--yaml'] : []),
      '--yes'
    ];

    await this.execFly(args);
  }

  /**
   * @private
   * Ensure Fly CLI is installed and authenticated
   *
   * @throws An error if Fly CLI is not installed or not authenticated
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if the cli is installed
      if (!(await this.isInstalled())) {
        throw new Error('Fly CLI must be installed to use this library');
      }

      // Print installed cli version
      const { version } = await this.version();
      this.logger.info(`Fly CLI ${version} is installed`);

      // Check authentication via logged in user or a token
      const user = await this.execFly<string>(['auth', 'whoami']);
      this.logger.info(`Authenticated as '${user}'`);

      this.initialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize Fly');
      throw error;
    }
  }

  /**
   * @private
   * Execute a fly command and optionally return the output as JSON
   *
   * @param command - The fly command to execute (empty array items are ignored)
   * @returns The JSON output of the command, or the raw output if not JSON
   * @throws An error if the command fails
   */
  private async execFly<T>(
    command: string | Array<string>,
    options?: ExecFlyOptions
  ): Promise<T>;
  /**
   * @private
   * Execute a fly command and optionally return the output as JSON
   *
   * @param command - The fly command to execute (empty array items are ignored)
   * @param onError - What to do if the command fails, throw or return `null` (defaults to `throwOnError`)
   * @returns The JSON output of the command, or the raw output if not JSON
   * @throws An error if the command fails and `onError` is `throwOnError`
   */
  private async execFly<T>(
    command: string | Array<string>,
    options?: ExecFlyOptions,
    onError?: 'nullOnError'
  ): Promise<T>;
  private async execFly<T>(
    command: string | Array<string>,
    options?: ExecFlyOptions,
    onError: 'nullOnError' | 'throwOnError' = 'throwOnError'
  ): Promise<T> {
    const args = Array.isArray(command) ? command : command.split(' ');

    if (this.logger.verbose) {
      args.push('--verbose');
    }
    if (this.logger.debug) {
      args.push('--debug');
    }

    const flyCmd = 'flyctl';
    const toLogCmd = `${flyCmd} ${args.join(' ')}`;
    let output = '';

    try {
      this.traceCLI('CALL', toLogCmd);
      // If the command requires interactive input, use spawnPty
      if (options?.prompt) {
        output = await spawnPty(flyCmd, args, { prompt: options.prompt });
        this.traceCLI('RESULT', output);
      } else {
        // Otherwise use spawn
        const { streamStrategy = 'stdout', ...spawnOpts } = options ?? {};
        const result = await spawn(flyCmd, args, {
          ...spawnOpts,
          streamToConsole: this.logger.streamToConsole
        });
        const stdout = result.stdout.trim();
        const stderr = result.stderr.trim();
        this.traceCLI('RESULT', `${stdout}${stderr ? `\n${stderr}` : ''}`);
        output =
          streamStrategy === 'combined'
            ? `${stdout}\n${stderr}`
            : streamStrategy === 'stderr'
              ? stderr
              : stdout;
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.traceCLI('RESULT', errorMsg);
      if (onError === 'throwOnError') {
        throw new Error(`Command failed: ${toLogCmd}
${errorMsg}`);
      }
      return null as T;
    }

    try {
      return JSON.parse(output) as T;
    } catch {
      if (output) {
        if (this.logger.traceCLI) {
          this.logger.info(`Failed to parse as JSON, returning raw output`);
        }
        return output as T;
      }
    }
    return undefined as T;
  }

  /**
   * @private
   * Get the arguments for `AppOrConfig` options
   * where either the application or configuration can be provided
   * but not both.
   *
   * First check `options` and then the class configuration.
   *
   * Should be used in Fly commands with optional flags
   * - `--app`
   * - `--config`
   *
   * @param options - Options to get the arguments for
   * @returns The arguments to use in a fly command
   */
  private getAppOrConfigArgs(options?: AppOrConfig): Array<string> {
    const normalized = this.normalizeOptions(options);

    const app = normalized.app || this.instanceApp;
    const config = normalized.config || this.instanceConfig;

    const args: Array<string> = [];

    if (app) {
      args.push('--app', app);
    }
    if (config) {
      args.push('--config', config);
    }

    if (app && config) {
      this.logger.info(
        `Both app '${app}' and config '${config}' were provided, check your implementation!`
      );
    }

    return args;
  }

  /**
   * @private
   * Get the Postgres clusters attached to an app
   *
   * @param app - The app to get the attached Postgres clusters for
   * @returns The attached Postgres clusters
   * @throws An error if the Postgres clusters cannot be retrieved
   */
  private async getAttachedPostgresClusters(
    app: string
  ): Promise<Array<string>> {
    const attached = new Set<string>();
    const postgres = await this.fetchAllPostgres('throwOnError');
    for (const { name } of postgres) {
      const users = await this.fetchPostgresUsers(name, 'nullOnError');
      if (!users) {
        this.logger.info(
          `Failed to fetch users for Postgres cluster '${name}', ignoring`
        );
        continue;
      }
      // Postgres users are always returned as underscores, but app names are usually dashes
      if (users.some((user) => user.username === app.replace(/-/g, '_'))) {
        attached.add(name);
      }
    }
    return Array.from(attached);
  }

  /**
   * @private
   * Check if the Fly CLI is installed
   *
   * @returns `true` if the Fly CLI is installed, `false` otherwise
   */
  private async isInstalled(): Promise<boolean> {
    return (await this.execFly('version', undefined, 'nullOnError')) !== null;
  }

  /**
   * @private
   * Get the installed Fly CLI version
   *
   * @returns The installed Fly CLI version information
   * @throws An error if the version cannot be retrieved
   */
  private async version(): Promise<VersionResponse> {
    return VersionTransformedResponseSchema.parse(
      await this.execFly(['version', '--json'])
    );
  }

  /**
   * @private
   * Normalize the options matching `AppOrConfig` type.
   *
   * A missing value gets an empty string.
   *
   * @param options - The options to normalize
   * @returns The normalized options
   */
  private normalizeOptions<T extends AppOrConfig>(
    options?: T
  ): { app: string; config: string } {
    if (!options) {
      return { app: '', config: '' };
    }

    const app = 'app' in options && options.app ? options.app : '';
    const config = 'config' in options && options.config ? options.config : '';

    return { app, config };
  }

  /**
   * Escape an argument for Fly cli
   *
   * @param arg - The argument to escape
   * @returns The escaped argument
   */
  private safeArg(arg: string): string {
    return arg.replace(/\\/g, '\\\\').replace(/ /g, '\\ ');
  }

  /**
   * @private
   * Redact sensitive values from text.
   *
   * Identifies and redacts:
   * - Secret values provided with `secrets set KEY1=VALUE1 KEY2=VALUE2 ...`
   *
   * @param text - The text to redact
   * @returns The redacted text
   */
  private redactSensitiveData(text: string): string {
    const maskValue = (value: string): string =>
      value.length > 10
        ? `${value.slice(0, 3)}[REDACTED]${value.slice(-3)}`
        : '[REDACTED]';

    // Pattern to match values including escaped spaces (e.g., "test\ value")
    // Must check for escaped space BEFORE \S to avoid matching backslash alone
    const valuePattern = '((?:\\\\ |\\S)+)';

    return text.replace(
      new RegExp(
        `(secrets\\s+set\\s+.*?)([A-Z_][A-Z0-9_]*)=${valuePattern}`,
        'g'
      ),
      (_, prefix, key, value) => `${prefix}${key}=${maskValue(value)}`
    );
  }

  /**
   * @private
   * Trace the CLI calls, mocks and results
   *
   * Redacts sensitive data from CALL messages when enabled in logger config.
   *
   * @param type - The type of trace
   * @param msg - The message to trace
   */
  private traceCLI(type: 'CALL' | 'MOCK' | 'RESULT', msg: string): void {
    if (this.logger.traceCLI) {
      const typeLabel =
        type === 'CALL' ? ' CALL ' : type === 'MOCK' ? ' MOCK ' : 'RESULT';

      let message = msg;
      if (type === 'CALL' && this.logger.redactSecrets && msg) {
        message = this.redactSensitiveData(msg);
      }

      this.logger.info(`[${typeLabel}] ${message}`);
    }
  }
}
