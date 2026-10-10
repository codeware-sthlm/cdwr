import * as core from '@actions/core';
import { withInfisical } from '@codeware/shared/feature/infisical';

import {
  type DeploymentsMap,
  type SkippedDeployment,
  planDeployments
} from './deployments';
import type { InfisicalConfig } from './infisical-config';

export const skipReasons: Record<SkippedDeployment['reason'], string> = {
  'no-flag': 'no DEPLOY_ENABLED secret',
  'flag-off': 'DEPLOY_ENABLED is not true',
  'invalid-name': 'the folder name is not a valid deployment name'
};

/**
 * Fetch the deployments to run from Infisical.
 *
 * A host app deploys when `/apps/<app>/DEPLOY_ENABLED` is on, a tenant of an
 * app when `/tenants/<tenant>/apps/<app>/DEPLOY_ENABLED` is on. Nothing else
 * decides.
 *
 * @param config - Infisical configuration
 * @param appNames - List of app names to plan deployments for
 * @returns The deployments per app and the entries skipped, with the reason
 */
export async function fetchDeployments(
  { environment, clientId, clientSecret, projectId, site }: InfisicalConfig,
  appNames: Array<string>
): Promise<{ deployments: DeploymentsMap; skipped: Array<SkippedDeployment> }> {
  if (appNames.length === 0) {
    core.info('[fetch-deployments] No apps provided, skipping fetch');
    return { deployments: {}, skipped: [] };
  }

  const read = (path: string) =>
    withInfisical({
      clientId,
      clientSecret,
      projectId,
      site,
      environment,
      filter: { path, recurse: true },
      groupByFolder: true
    });

  try {
    const [appFolders, tenantFolders] = await Promise.all([
      read('/apps'),
      read('/tenants')
    ]);

    const folders = [...(appFolders ?? []), ...(tenantFolders ?? [])];
    core.info(
      `[fetch-deployments] Found ${folders.length} folder(s) under /apps and /tenants`
    );

    const { deployments, skipped } = planDeployments(folders, appNames);

    for (const [app, entries] of Object.entries(deployments)) {
      for (const { tenant, env, secrets } of entries) {
        core.info(
          tenant === undefined
            ? `[fetch-deployments] Enabled: app '${app}' host`
            : `[fetch-deployments] Enabled: app '${app}' tenant '${tenant}' (${Object.keys(env ?? {}).length} env, ${Object.keys(secrets ?? {}).length} secrets)`
        );
      }
    }

    for (const { app, tenant, reason } of skipped) {
      const target = tenant === undefined ? 'host' : `tenant '${tenant}'`;
      core.info(
        `[fetch-deployments] Skipped: app '${app}' ${target} in '${environment}': ${skipReasons[reason]}`
      );
    }

    const enabled = Object.values(deployments).flat().length;
    core.info(
      `[fetch-deployments] Total: ${enabled} deployment(s) enabled, ${skipped.length} skipped`
    );

    return { deployments, skipped };
  } catch (error) {
    if (error instanceof Error) {
      core.error(`[fetch-deployments] Error: ${error.message}`);
      if (error.cause) {
        core.error(`[fetch-deployments] Cause: ${JSON.stringify(error.cause)}`);
      }
    } else {
      core.error(`[fetch-deployments] Unknown error: ${JSON.stringify(error)}`);
    }
    throw error;
  }
}
