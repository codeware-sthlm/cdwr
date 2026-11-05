import * as core from '@actions/core';
import { Fly } from '@cdwr/fly-node';
import { type Environment, getAppName } from '@codeware/shared/util/nx-deploy';

import type { ActionOutputs } from '../schemas/action-outputs.schema';
import type { DeploymentConfig } from '../schemas/deployment-config.schema';

import { addOpinionatedEnv } from './add-opinionated-env';
import { getHealthCheckPath, probeHealth } from './probe-health';
import type { ResolvedAppDetails } from './resolve-tenant-secrets';

/**
 * Deploy provided apps or apps that are affected by code changes
 * and have Fly configuration available.
 *
 * When `imageMap` is provided, each app is deployed using the pre-built image
 * reference instead of triggering a Docker build inside the deploy command.
 *
 * @param options - Deployment options
 * @returns List of deploy statuses of apps
 */
export const runDeployApps = async (options: {
  /** Planned deployments with their tenant secrets read from Infisical */
  appDetails: ResolvedAppDetails;
  config: DeploymentConfig;
  environment: Environment;
  fly: Fly;
  pullRequest: number | undefined;
  imageMap?: Record<string, string>;
}): Promise<ActionOutputs['projects']> => {
  const projects: ActionOutputs['projects'] = [];

  const { appDetails, config, environment, fly, imageMap, pullRequest } =
    options;

  // Track apps whose host deployment failed so tenant deployments can be skipped.
  // Deploying tenants against an incompatible schema would cause runtime failures.
  const failedHostApps = new Set<string>();

  core.info(`Found ${config.apps.length} apps to deploy`);

  for (const app of config.apps) {
    const { flyConfigFile, githubConfig, name: projectName, sentry } = app;

    core.startGroup(`Deploy ${projectName}`);

    // Pre-deploy only lists apps that have somewhere to go. One without any is
    // never deployed as a bare host app: that is how a host nobody asked for
    // reaches production.
    const appDeploymentDetails = appDetails[projectName] ?? [];
    if (appDeploymentDetails.length === 0) {
      core.warning(
        `Skipping ${projectName}: no host or tenant deployment is enabled for it`
      );
      core.endGroup();
      continue;
    }

    // Read the base app name and the health check path from local config
    let configAppName: string;
    let healthCheckPath: string | undefined;

    core.info(`Read Fly config file: ${flyConfigFile}`);
    try {
      const flyConfig = await fly.config.show({
        config: flyConfigFile,
        local: true
      });
      configAppName = flyConfig.app;
      healthCheckPath = getHealthCheckPath(flyConfig.httpService);
    } catch {
      core.endGroup();
      throw new Error(
        `Fly config file could not be resolved, cannot deploy ${projectName}`
      );
    }

    core.info(`Resolved app name: ${configAppName}`);
    core.info(`Ready to fly >>>`);

    // The host deployment (no tenant) must run first so migrations complete
    // before tenant apps start
    const deploymentsToRun = [...appDeploymentDetails].sort((a, b) =>
      !a.tenant === !b.tenant ? 0 : !a.tenant ? -1 : 1
    );

    core.info(
      `${deploymentsToRun.length} deployment(s): ${deploymentsToRun
        .map((d) => d.tenant ?? 'host')
        .join(', ')}`
    );

    // Deploy once for each deployment configuration
    for (const deploymentDetails of deploymentsToRun) {
      const tenantId = deploymentDetails.tenant;
      const isHostDeployment = !tenantId;
      const tenantLabel = tenantId ? ` for tenant '${tenantId}'` : '';

      if (!isHostDeployment && failedHostApps.has(configAppName)) {
        core.warning(
          `Skipping${tenantLabel}: host deployment for '${configAppName}' failed — tenant would run against an incompatible schema`
        );
        projects.push({
          appOrProject: `${projectName} (${tenantId})`,
          action: 'failed',
          error: `Skipped: host deployment failed`
        });
        continue;
      }

      // The secrets this deployment needs could not be read
      if (deploymentDetails.error) {
        core.warning(`Skipping${tenantLabel}: ${deploymentDetails.error}`);
        projects.push({
          appOrProject: tenantId ? `${projectName} (${tenantId})` : projectName,
          action: 'failed',
          error: deploymentDetails.error
        });
        continue;
      }

      core.info(`Deploying${tenantLabel}...`);

      const appName = getAppName({
        configAppName,
        environment,
        pullRequest,
        tenantId
      });

      const preBuiltImage = imageMap?.[projectName];
      if (preBuiltImage) {
        core.info(`Using pre-built image: ${preBuiltImage}`);
      }

      // Merge secrets: global -> deployment-specific (deployment wins).
      // An app that runs third-party code opts out of the global ones.
      const withholdShared = githubConfig.sharedSecrets === false;
      if (withholdShared) {
        core.info('Shared secrets withheld: sharedSecrets is false');
      }
      const mergedSecrets = {
        ...(!withholdShared && config.secrets),
        ...deploymentDetails.secrets
      };

      // Merge environment variables: global -> app Sentry -> deployment-specific
      // (deployment wins). Sentry is per app since projects map to apps.
      const mergedEnv = {
        ...config.env,
        ...(sentry && {
          SENTRY_DSN: sentry.dsn,
          SENTRY_PROJECT: sentry.project,
          ...(sentry.release && { SENTRY_RELEASE: sentry.release })
        }),
        ...deploymentDetails.env
      };

      // Add opinionated environment variables
      const envVars = addOpinionatedEnv(
        { appName, prNumber: pullRequest, tenantId },
        mergedEnv
      );

      // Get postgres connection string
      const postgres =
        environment === 'preview'
          ? githubConfig.flyPostgresPreview
          : githubConfig.flyPostgresProduction;

      // Get database name (shared across all apps)
      const databaseName = githubConfig.flyPostgresDatabaseName;

      core.info(`Deploy app '${appName}' to '${environment}'${tenantLabel}...`);

      // Deploy app
      try {
        const result = await fly.deploy({
          app: appName,
          config: flyConfigFile,
          databaseName: databaseName || undefined, // rather undefined than empty string
          env: envVars,
          environment,
          image: preBuiltImage,
          optOutDepotBuilder: config.fly.optOutDepotBuilder,
          postgres: postgres || undefined, // rather undefined than empty string
          preferRemoteConfig: true,
          secrets: mergedSecrets
        });

        // A green deploy is no proof the app answers: a retried first deploy
        // updates a suspended machine without waiting for its health check.
        // fly-node gives the app its addresses before deploying, so one
        // request to the app's own check settles it.
        if (healthCheckPath) {
          core.info(`Probe ${result.url}${healthCheckPath}...`);
          const failure = await probeHealth(result.url, healthCheckPath);
          if (failure) {
            throw new Error(
              `Deployed, but the health probe failed: ${failure}`
            );
          }
          core.info(`Health probe answered 200`);
        } else {
          core.info(
            `No health probe: ${flyConfigFile} has no [[http_service.checks]]`
          );
        }

        core.info(`🚀 Deployed to '${result.url}'${tenantLabel}`);

        projects.push({
          action: 'deploy',
          app: result.app,
          name: tenantId ? `${projectName} (${tenantId})` : projectName,
          projectName,
          url: result.url
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        core.error(`❌ Failed to deploy project${tenantLabel}: ${msg}`);

        projects.push({
          appOrProject: tenantId ? `${projectName} (${tenantId})` : projectName,
          action: 'failed',
          error: msg
        });

        if (isHostDeployment) {
          failedHostApps.add(configAppName);
        }
      }
    }

    core.endGroup();
  }

  core.info(
    `Deployed ${projects.filter((p) => p.action === 'deploy').length} apps`
  );

  return projects;
};
