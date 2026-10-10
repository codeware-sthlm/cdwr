import * as core from '@actions/core';
import { Fly } from '@cdwr/fly-node';
import { type Environment, getAppName } from '@codeware/shared/util/nx-deploy';

import type { BuildConfig } from '../schemas/build-config.schema';

/**
 * Build Docker images for all apps that would be deployed and push them to
 * the Fly registry without deploying. Returns a map of project name to image
 * reference for use in a subsequent deploy phase.
 *
 * Building once before deploying provides two benefits:
 * - Build failures surface before touching live machines
 * - Multi-tenant apps that share an image build it once instead of N times
 *
 * @param options - Build options
 * @returns Map of project name to image reference
 */
export const runBuildApps = async (options: {
  config: BuildConfig;
  environment: Environment;
  fly: Fly;
  pullRequest: number | undefined;
}): Promise<Record<string, string>> => {
  const images: Record<string, string> = {};

  const { config, environment, fly, pullRequest } = options;

  core.info(`Found ${config.apps.length} apps to build`);

  for (const app of config.apps) {
    const { flyConfigFile, name: projectName, sentry } = app;

    core.startGroup(`Build Docker image for ${projectName}`);

    // Pushing an image creates the app on Fly, so an app with nowhere to
    // deploy would leave a bare host app behind
    const details = config.appDetails[projectName] ?? [];
    if (details.length === 0) {
      core.warning(
        `Skipping ${projectName}: no host or tenant deployment is enabled for it`
      );
      core.endGroup();
      continue;
    }

    let configAppName: string;

    core.info(`Read Fly config file: ${flyConfigFile}`);
    try {
      const flyConfig = await fly.config.show({
        config: flyConfigFile,
        local: true
      });
      configAppName = flyConfig.app;
    } catch {
      core.endGroup();
      throw new Error(
        `Fly config file could not be resolved, cannot build image for ${projectName}`
      );
    }

    // For apps that have no host deployment, use the first tenant as the build
    // target to avoid creating a ghost host app with no machines. The resulting
    // image URL is still shared across all tenants of the same app.
    const hasTenantOnlyDeployment = details.every((d) => d.tenant);
    const buildTenantId = hasTenantOnlyDeployment
      ? details[0]?.tenant
      : undefined;

    const appName = getAppName({
      configAppName,
      environment,
      pullRequest,
      tenantId: buildTenantId
    });

    core.info(`Building image for app '${appName}'...`);

    // The app's own Sentry project and release, so source maps upload to the
    // right project. Shared credentials stay in the workflow-level build args.
    const buildArgs = {
      ...config.buildArgs,
      ...(sentry && {
        SENTRY_DSN: sentry.dsn,
        SENTRY_PROJECT: sentry.project,
        ...(sentry.release && { SENTRY_RELEASE: sentry.release })
      })
    };

    if (sentry) {
      core.info(
        `Sentry project '${sentry.project}', release '${sentry.release ?? '<none>'}'`
      );
    }

    const { imageRef } = await fly.build({
      app: appName,
      buildArgs,
      config: flyConfigFile,
      optOutDepotBuilder: config.fly.optOutDepotBuilder,
      preferRemoteConfig: true
    });

    core.info(`Image built: ${imageRef}`);
    images[projectName] = imageRef;

    core.endGroup();
  }

  core.info(`Built images for ${Object.keys(images).length} apps`);

  return images;
};
