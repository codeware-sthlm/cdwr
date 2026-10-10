import { timingSafeEqual } from 'node:crypto';

import type {
  ApiKeyState,
  InfisicalAppFacts,
  InfisicalEnvironmentFacts,
  InfisicalStatus,
  ProvisioningEnvironment
} from '@codeware/app-cms/ui/provisioning';
import {
  getAppName,
  isDeployEnabled,
  ownDeployFlag
} from '@codeware/shared/util/pure';
import type { InfisicalSDK } from '@infisical/sdk';

import { FLY_CONFIG_APP_NAMES, TENANT_APPS } from './tenant-apps';

export const PROVISIONING_ENVIRONMENTS = [
  'production',
  'preview'
] as const satisfies ReadonlyArray<ProvisioningEnvironment>;

/** Whether a deployment environment has tenant folders to report */
export const isProvisioningEnvironment = (
  value: string
): value is ProvisioningEnvironment =>
  (PROVISIONING_ENVIRONMENTS as ReadonlyArray<string>).includes(value);

/** Keys a workspace may set, reported when present */
export const OPTIONAL_KEYS = ['RESTRICTED_FONTS'] as const;

type Options = {
  client: InfisicalSDK;
  /**
   * Environments to read. The key is compared with the database of the app
   * doing the reading, so only that app's own environment can be judged
   */
  environments: ReadonlyArray<ProvisioningEnvironment>;
  projectId: string;
  deployment: string;
  /** The workspace's own key, compared on the server and never returned */
  apiKey: string | null | undefined;
  /** HTTP status behind a rejected SDK call */
  statusOf: (error: unknown) => number | undefined;
};

/** Statuses that mean "this identity cannot see it", not "something broke" */
const UNREADABLE = new Set([401, 403]);

/**
 * Compared in constant time, so the check takes the same time wherever the
 * keys differ. Lengths are checked first because `timingSafeEqual` requires
 * equal ones; a key's length is not what keeps it secret.
 */
const compareKey = (
  stored: string | undefined,
  own: string | null | undefined
): ApiKeyState => {
  if (!stored) {
    return 'missing';
  }
  if (!own) {
    return 'mismatch';
  }
  const a = Buffer.from(stored);
  const b = Buffer.from(own);

  return a.length === b.length && timingSafeEqual(a, b)
    ? 'matches'
    : 'mismatch';
};

/**
 * The Fly app a folder deploys as. A preview's pull request number is not
 * known here, so it is written as `<n>` in the name the deploy would build.
 */
const flyAppName = (
  app: (typeof TENANT_APPS)[number],
  environment: ProvisioningEnvironment,
  deployment: string
) =>
  getAppName({
    environment: 'production',
    configAppName:
      environment === 'preview'
        ? `${FLY_CONFIG_APP_NAMES[app]}-pr-<n>`
        : FLY_CONFIG_APP_NAMES[app],
    tenantId: deployment
  });

/**
 * Read what Infisical holds for a workspace, per environment.
 *
 * Reports the folders the deploy reads — `/tenants/<deployment>/apps/<app>` —
 * and whether each one's `DEPLOY_ENABLED` is on. No secret value leaves this
 * function: the API key is compared here and only the verdict is returned.
 */
export async function readInfisicalStatus({
  client,
  projectId,
  environments,
  deployment,
  apiKey,
  statusOf
}: Options): Promise<InfisicalStatus> {
  const readEnvironment = async (
    environment: ProvisioningEnvironment
  ): Promise<InfisicalEnvironmentFacts> => {
    const appsPath = `/tenants/${deployment}/apps`;
    let folderNames: Array<string>;

    try {
      const folders = await client.folders().listFolders({
        environment,
        projectId,
        path: appsPath
      });
      folderNames = folders.map((folder) => folder.name);
    } catch (error) {
      const status = statusOf(error) ?? 0;

      // No folder for this workspace in this environment yet
      if (status === 404) {
        folderNames = [];
      } else if (UNREADABLE.has(status)) {
        return { environment, access: 'unreadable' };
      } else {
        throw error;
      }
    }

    const apps = await Promise.all(
      TENANT_APPS.filter((app) => folderNames.includes(app)).map(
        async (app): Promise<InfisicalAppFacts> => {
          const folderPath = `${appsPath}/${app}`;
          const secrets = await client.secrets().listSecretsWithImports({
            environment,
            projectId,
            secretPath: folderPath,
            expandSecretReferences: true,
            recursive: false
          });
          const keys = new Map(
            secrets.map((secret) => [secret.secretKey, secret.secretValue])
          );

          return {
            app,
            flyApp: flyAppName(app, environment, deployment),
            included: isDeployEnabled(ownDeployFlag(secrets, folderPath)),
            apiKey: compareKey(keys.get('PAYLOAD_API_KEY'), apiKey),
            optionalKeys: OPTIONAL_KEYS.filter((key) => keys.has(key))
          };
        }
      )
    );

    return { environment, access: 'ok', apps };
  };

  return {
    deployment,
    checkedAt: new Date().toISOString(),
    environments: await Promise.all(environments.map(readEnvironment))
  };
}
