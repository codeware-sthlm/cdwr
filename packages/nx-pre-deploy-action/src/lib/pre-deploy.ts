import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  type DeploymentsMap,
  type InfisicalConfig,
  type SkippedDeployment,
  fetchAppSentry,
  fetchDeployments,
  skipReasons
} from '@codeware/shared/feature/tenancy';
import { getDeployEnv, printGitHubContext } from '@codeware/shared/util/github';
import {
  type DeployableApp,
  analyzeAppsToDeploy
} from '@codeware/shared/util/nx-deploy';

import type { ActionInputs } from './schemas/action-inputs.schema';
import {
  type ActionOutputs,
  ActionOutputsSchema,
  type Environment
} from './schemas/action-outputs.schema';
import { normalizeInputs } from './utils/normailze-inputs';

/**
 * Run pre-deploy process
 *
 * @param inputs Options
 * @param throwOnError Whether to throw on error
 */
export async function preDeploy(
  inputs: ActionInputs,
  throwOnError = false
): Promise<ActionOutputs> {
  try {
    let environment: Environment = '';

    core.info('Starting pre-deploy process');

    core.startGroup('GitHub context details');
    printGitHubContext();
    core.endGroup();

    core.startGroup('Get normalized configuration');
    const config = await normalizeInputs(inputs);
    core.endGroup();

    core.startGroup('Analyze environment');
    const response = getDeployEnv(github.context, config.mainBranch);

    // Use manual environment override if provided
    if (inputs.manualEnvironment) {
      core.info(
        `Manual environment override: ${inputs.manualEnvironment} (auto-detected: ${response.environment || 'none'})`
      );
      environment = inputs.manualEnvironment;
    } else if (response.environment) {
      environment = response.environment;
    } else {
      // For workflow_dispatch, log as info instead of warning since it's expected
      if (github.context.eventName === 'workflow_dispatch') {
        core.info(response.reason);
      } else {
        core.warning(response.reason);
      }
    }
    core.info(`Deploy to environment: ${environment || '<none>'}`);
    core.endGroup();

    core.startGroup('Determine applications to deploy');

    if (inputs.manualApp) {
      core.info(`Manual app override: ${inputs.manualApp}`);
    }

    // Preview deployments version within a per-PR lane so concurrent PRs never
    // race for the same counter. Production releases have no prerelease id.
    //
    // Anything non-production must get a lane even when the PR number is
    // missing — without a preid nx resolves production versions, and the
    // deployment would push a real release tag and advance the production
    // baseline. PR numbers start at 1, so 0 is a safe lane to fall back to.
    const preid =
      environment && environment !== 'production'
        ? `preview.${inputs.prNumber || 0}`
        : undefined;
    core.info(`Release lane: ${preid ?? '<production>'}`);

    const analyzed = await analyzeAppsToDeploy(
      environment,
      preid,
      inputs.manualApp ? [inputs.manualApp] : undefined,
      Number(inputs.prNumber) || undefined,
      config.mainBranch
    );

    const apps: DeployableApp[] = analyzed.flatMap((app) => {
      if (app.status === 'deploy') {
        core.info(`Deploy: ${app.projectName} @ ${app.version}`);
        return [
          {
            name: app.projectName,
            flyConfigFile: app.flyConfigFile,
            githubConfig: app.githubConfig,
            version: app.version,
            previousVersion: app.previousVersion
          }
        ];
      }
      core.info(`Skip: ${app.projectName} - ${app.reason}`);
      return [];
    });

    core.endGroup();

    const appNames = apps.map((a) => a.name);
    core.info(`Applications to deploy: ${appNames.join(', ') || '<none>'}`);

    if (!environment) {
      core.info('Skipping deployment discovery (no valid environment)');
      return ActionOutputsSchema.parse({ apps, environment, appTenants: {} });
    }

    if (apps.length === 0) {
      core.info('Skipping deployment discovery (no apps to deploy)');
      return ActionOutputsSchema.parse({ apps, environment, appTenants: {} });
    }

    // Without the vault nothing says where an app may deploy, and guessing
    // "everywhere" is how a bare host app reaches production
    if (!config.infisical) {
      throw new Error(
        `Infisical credentials are required to decide where apps deploy in '${environment}'`
      );
    }

    const { clientId, clientSecret, projectId, site } = config.infisical;

    const infisicalConfig: InfisicalConfig = {
      environment,
      clientId,
      clientSecret,
      projectId,
      site
    };

    core.startGroup('Discover deployments from Infisical');

    const discovered = await fetchDeployments(infisicalConfig, appNames);
    let deployments: DeploymentsMap = discovered.deployments;

    // Narrows the set, never widens it: a tenant whose flag is off stays off
    if (inputs.manualTenant) {
      core.info(`Manual tenant override: ${inputs.manualTenant}`);
      deployments = Object.fromEntries(
        Object.entries(deployments).map(([app, entries]) => [
          app,
          entries.filter((entry) => entry.tenant === inputs.manualTenant)
        ])
      );
    }

    const deployable = apps.filter((app) => {
      if (deployments[app.name]?.length) {
        return true;
      }
      // A warning, not a line in the log: a release that ships nowhere still
      // leaves the run green
      core.warning(
        discovered.deployments[app.name]?.length
          ? `Skip: ${app.name} - no deployment for tenant '${inputs.manualTenant}'`
          : `Skip: ${app.name} - nothing enabled in '${environment}'${describeSkipped(app.name, discovered.skipped)}`
      );
      return false;
    });

    const appTenants: ActionOutputs['appTenants'] = Object.fromEntries(
      deployable.map((app) => [
        app.name,
        toTenantEntries(deployments[app.name])
      ])
    );

    // A host app deploys beside the app that previews against it, even when
    // nothing bumped the host. A manual app run deploys only what it names.
    if (environment === 'preview' && !inputs.manualApp) {
      const deploying = new Set(deployable.map((app) => app.name));
      // Companion name -> the deploying apps asking for it
      const requested = new Map<string, Array<string>>();
      for (const app of analyzed) {
        if (app.status !== 'deploy' || !deploying.has(app.projectName)) {
          continue;
        }
        for (const name of app.githubConfig.previewWith ?? []) {
          if (!deploying.has(name)) {
            requested.set(name, [
              ...(requested.get(name) ?? []),
              app.projectName
            ]);
          }
        }
      }
      const companions = [...requested.keys()];

      if (companions.length > 0) {
        const analyzedCompanions = await analyzeAppsToDeploy(
          environment,
          preid,
          companions,
          Number(inputs.prNumber) || undefined,
          config.mainBranch
        );

        const companionApps: DeployableApp[] = analyzedCompanions.flatMap(
          (app) => {
            if (app.status === 'deploy') {
              core.info(
                `Deploy: ${app.projectName} @ ${app.version} (preview beside ${requested.get(app.projectName)?.join(', ')})`
              );
              return [
                {
                  name: app.projectName,
                  flyConfigFile: app.flyConfigFile,
                  githubConfig: app.githubConfig,
                  version: app.version,
                  previousVersion: app.previousVersion
                }
              ];
            }
            core.warning(`Skip: ${app.projectName} - ${app.reason}`);
            return [];
          }
        );

        if (companionApps.length > 0) {
          const found = await fetchDeployments(
            infisicalConfig,
            companionApps.map((app) => app.name)
          );

          for (const app of companionApps) {
            // Only the host entry: a tenant filter never narrows a companion
            const host = (found.deployments[app.name] ?? []).filter(
              (entry) => entry.tenant === undefined
            );
            if (host.length === 0) {
              core.warning(
                `Skip: ${app.name} - no host deployment enabled in '${environment}'${describeSkipped(app.name, found.skipped)}`
              );
              continue;
            }
            deployable.push(app);
            appTenants[app.name] = toTenantEntries(host);
          }
        }
      }
    }

    for (const [app, entries] of Object.entries(appTenants)) {
      core.info(
        `Deploy ${app} to: ${entries.map((entry) => entry.tenant ?? '<host>').join(', ')}`
      );
    }

    core.endGroup();

    core.startGroup('Fetch app-specific Sentry configuration from Infisical');

    // Attach the Sentry project each app reports to. Apps without a complete
    // configuration are left untouched, which disables Sentry for them.
    const appSentry = await fetchAppSentry(
      infisicalConfig,
      deployable.map((app) => app.name)
    );
    for (const app of deployable) {
      // Only set it when there is something to set — an explicit `undefined`
      // is not the same as an absent key to every downstream consumer
      if (appSentry[app.name]) {
        app.sentry = appSentry[app.name];
      }
    }

    core.endGroup();

    return ActionOutputsSchema.parse({
      apps: deployable,
      environment,
      appTenants
    });
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);

      if (throwOnError) {
        throw error.message;
      }
    }

    return {} as ActionOutputs;
  }
}

/** Why an app has nothing to deploy, as far as the folders say */
const describeSkipped = (
  app: string,
  skipped: Array<SkippedDeployment>
): string => {
  const own = skipped.filter((entry) => entry.app === app);
  if (own.length === 0) {
    return ' (no folder sets DEPLOY_ENABLED)';
  }
  const parts = own.map(
    ({ tenant, reason }) => `${tenant ?? 'host'}: ${skipReasons[reason]}`
  );
  return ` (${parts.join(', ')})`;
};

/** Only the secret names leave this step; the values stay in Infisical */
const toTenantEntries = (
  entries: DeploymentsMap[string]
): ActionOutputs['appTenants'][string] =>
  entries.map(({ secrets, ...entry }) => {
    const secretNames = Object.keys(secrets ?? {}).sort();
    return secretNames.length > 0 ? { ...entry, secretNames } : entry;
  });
