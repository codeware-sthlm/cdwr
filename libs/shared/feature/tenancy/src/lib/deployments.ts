import {
  DEPLOY_ENABLED_KEY,
  deploymentNameIssue,
  isDeployEnabled,
  ownDeployFlag
} from '@codeware/shared/util/pure';

export type DeploymentDetails = {
  /** Absent for the host deployment of an app. */
  tenant?: string;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
};

export type DeploymentsMap = {
  [appName: string]: Array<DeploymentDetails>;
};

export type SkippedDeployment = {
  app: string;
  /** Absent for the host deployment of an app. */
  tenant?: string;
  reason: 'no-flag' | 'flag-off' | 'invalid-name';
};

/** Structurally compatible with the folders `withInfisical` returns when grouping by folder. */
export type DeploymentFolder = {
  path: string;
  secrets: Array<{
    secretKey: string;
    secretValue: string;
    /** Where the secret lives; differs from the folder for an import or a subfolder */
    secretPath?: string;
    secretMetadata: ReadonlyArray<{ key: string; value: string }>;
  }>;
};

const hostPattern = /^\/apps\/([^/]+)$/;
const tenantPattern = /^\/tenants\/([^/]+)\/apps\/([^/]+)$/;

/**
 * Decide which deployments exist from the folders under `/apps` and `/tenants`.
 *
 * A host deployment is the folder `/apps/<app>`, a tenant deployment is
 * `/tenants/<tenant>/apps/<app>`. Each deploys only when its own
 * `DEPLOY_ENABLED` secret is on. A host entry carries no env or secrets, since
 * the app reads its own folder at boot.
 *
 * An empty folder without the flag is inert and not reported: Infisical's UI
 * creates such folders on the way to a nested one.
 */
export const planDeployments = (
  folders: Array<DeploymentFolder>,
  appNames: Array<string>
): { deployments: DeploymentsMap; skipped: Array<SkippedDeployment> } => {
  const hosts = new Map<string, DeploymentDetails>();
  const tenants = new Map<string, Array<DeploymentDetails>>();
  const skipped: Array<SkippedDeployment> = [];

  const deployments: DeploymentsMap = {};
  for (const app of appNames) {
    deployments[app] = [];
    tenants.set(app, []);
  }

  for (const folder of folders) {
    const hostMatch = folder.path.match(hostPattern);
    const tenantMatch = hostMatch ? null : folder.path.match(tenantPattern);

    const app = hostMatch?.[1] ?? tenantMatch?.[2];
    const tenant = tenantMatch?.[1];

    if (app === undefined || !appNames.includes(app)) {
      continue;
    }

    // Only the folder's own flag counts: one reached through an import or a
    // subfolder would switch on a deployment nobody switched on here
    const flag = ownDeployFlag(folder.secrets, folder.path);
    const others = folder.secrets.filter(
      (s) => s.secretKey !== DEPLOY_ENABLED_KEY
    );

    // Not a name the deploy can build an app from, e.g. the retired `_default`
    if (tenant !== undefined && deploymentNameIssue(tenant) !== null) {
      if (flag !== undefined || others.length > 0) {
        skipped.push({ app, tenant, reason: 'invalid-name' });
      }
      continue;
    }

    if (!isDeployEnabled(flag)) {
      if (flag !== undefined) {
        skipped.push({ app, tenant, reason: 'flag-off' });
      } else if (others.length > 0) {
        skipped.push({ app, tenant, reason: 'no-flag' });
      }
      continue;
    }

    if (tenant === undefined) {
      hosts.set(app, {});
      continue;
    }

    const env: Record<string, string> = {};
    const secrets: Record<string, string> = {};

    for (const secret of others) {
      const isEnvVar = secret.secretMetadata.some(
        ({ key, value }) => key === 'env' && value === 'true'
      );
      (isEnvVar ? env : secrets)[secret.secretKey] = secret.secretValue;
    }

    tenants.get(app)?.push({
      tenant,
      ...(Object.keys(env).length > 0 && { env }),
      ...(Object.keys(secrets).length > 0 && { secrets })
    });
  }

  for (const app of appNames) {
    const host = hosts.get(app);
    const sorted = (tenants.get(app) ?? []).sort((a, b) =>
      (a.tenant ?? '').localeCompare(b.tenant ?? '')
    );
    deployments[app] = host ? [host, ...sorted] : sorted;
  }

  skipped.sort(
    (a, b) =>
      a.app.localeCompare(b.app) ||
      Number(a.tenant !== undefined) - Number(b.tenant !== undefined) ||
      (a.tenant ?? '').localeCompare(b.tenant ?? '')
  );

  return { deployments, skipped };
};
