import * as core from '@actions/core';
import { withInfisical } from '@codeware/shared/feature/infisical';

import type { InfisicalConfig } from './infisical-config';

export type AppSentryDetails = {
  /** Sentry project slug the app reports to */
  project: string;
  /** Sentry DSN of that project */
  dsn: string;
};

export type AppSentryMap = {
  [appName: string]: AppSentryDetails;
};

/**
 * Fetch Sentry configuration for apps from Infisical.
 *
 * Sentry projects map one-to-one to apps, so the project slug and DSN live in
 * the app's own folder. Apps without both keys are omitted, which disables
 * Sentry for that app rather than failing the deployment.
 *
 * Expected Infisical structure:
 * - `/apps/<app-name>/SENTRY_PROJECT` = Sentry project slug, e.g. `cms`
 * - `/apps/<app-name>/SENTRY_DSN` = DSN of that project
 *
 * The organization slug and auth token are shared across apps and come from the
 * root path via GitHub secrets instead.
 *
 * @param config - Infisical configuration
 * @param appNames - List of app names to fetch Sentry configuration for
 * @returns Map of app names to their Sentry details
 */
export async function fetchAppSentry(
  { environment, clientId, clientSecret, projectId, site }: InfisicalConfig,
  appNames: string[]
): Promise<AppSentryMap> {
  const appSentryMap: AppSentryMap = {};

  if (appNames.length === 0) {
    core.info('[fetch-app-sentry] No apps provided, skipping Sentry fetch');
    return appSentryMap;
  }

  try {
    const folderSecrets = await withInfisical({
      clientId,
      clientSecret,
      projectId,
      site,
      environment,
      filter: {
        path: '/apps',
        // Keeps each folder's secrets shallow. It does NOT limit which folders
        // are enumerated — `groupByFolder` always walks `/apps` recursively, so
        // nested folders come back too and are skipped by the match below.
        recurse: false
      },
      groupByFolder: true
    });

    core.info('[fetch-app-sentry] Connected successfully');

    for (const folder of folderSecrets ?? []) {
      const appName = folder.path.match(/^\/apps\/([^/]+)$/)?.[1];

      if (!appName || !appNames.includes(appName)) {
        continue;
      }

      const project = folder.secrets.find(
        (s) => s.secretKey === 'SENTRY_PROJECT'
      )?.secretValue;
      const dsn = folder.secrets.find(
        (s) => s.secretKey === 'SENTRY_DSN'
      )?.secretValue;

      if (!project || !dsn) {
        core.info(
          `[fetch-app-sentry] ${appName}: Sentry disabled (missing ${!project ? 'SENTRY_PROJECT' : 'SENTRY_DSN'})`
        );
        continue;
      }

      appSentryMap[appName] = { project, dsn };
      core.info(
        `[fetch-app-sentry] ${appName}: reports to project '${project}'`
      );
    }

    const missing = appNames.filter((name) => !appSentryMap[name]);
    if (missing.length) {
      core.info(
        `[fetch-app-sentry] Apps without Sentry configuration: ${missing.join(', ')}`
      );
    }

    return appSentryMap;
  } catch (error) {
    if (error instanceof Error) {
      core.error(`[fetch-app-sentry] Error: ${error.message}`);
      if (error.cause) {
        const cause =
          error.cause instanceof Error
            ? error.cause.message
            : 'non-Error cause';
        core.error(`[fetch-app-sentry] Cause: ${cause}`);
      }
    } else {
      core.error(`[fetch-app-sentry] Unknown error of type ${typeof error}`);
    }
    throw error;
  }
}
