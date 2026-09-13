import { timingSafeEqual } from 'node:crypto';

import type {
  ApiKeyState,
  InfisicalAppFacts,
  InfisicalEnvironmentFacts,
  InfisicalStatus,
  ProvisioningEnvironment
} from '@codeware/app-cms/ui/provisioning';
import {
  type DeployRulesSecret,
  getAppName,
  matchesDeployRule,
  parseDeployRule,
  readDeployRules
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
const UNREADABLE = new Set([401, 403, 404]);

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

/** The SDK types metadata as a record; the API sends an array */
const metadataOf = (value: unknown): DeployRulesSecret['secretMetadata'] =>
  (Array.isArray(value)
    ? value
    : value
      ? [value]
      : []) as DeployRulesSecret['secretMetadata'];

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
 * and whether `DEPLOY_RULES` deploys them. No secret value leaves this
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
    let rootSecrets;

    try {
      // With imports and references resolved, the way the deploy reads them
      rootSecrets = await client.secrets().listSecretsWithImports({
        environment,
        projectId,
        secretPath: '/',
        expandSecretReferences: true,
        recursive: false
      });
    } catch (error) {
      if (UNREADABLE.has(statusOf(error) ?? 0)) {
        return { environment, access: 'unreadable' };
      }
      throw error;
    }

    const rulesSecret = rootSecrets.find(
      (secret) => secret.secretKey === 'DEPLOY_RULES'
    );

    if (!rulesSecret) {
      return { environment, access: 'no-rules' };
    }

    let rules;

    try {
      ({ rules } = readDeployRules({
        secretValue: rulesSecret.secretValue,
        secretMetadata: metadataOf(rulesSecret.secretMetadata)
      }));
    } catch {
      return { environment, access: 'no-rules' };
    }

    const tenantRule = parseDeployRule(rules.tenants);
    const appRule = parseDeployRule(rules.apps);
    const tenants =
      tenantRule === null
        ? 'wildcard'
        : tenantRule.includes(deployment)
          ? 'listed'
          : 'excluded';

    const appsPath = `/tenants/${deployment}/apps`;
    let folderNames: Array<string> = [];

    try {
      const folders = await client.folders().listFolders({
        environment,
        projectId,
        path: appsPath
      });
      folderNames = folders.map((folder) => folder.name);
    } catch (error) {
      // No folder for this workspace in this environment yet
      if (statusOf(error) !== 404) {
        throw error;
      }
    }

    const apps = await Promise.all(
      TENANT_APPS.filter((app) => folderNames.includes(app)).map(
        async (app): Promise<InfisicalAppFacts> => {
          const secrets = await client.secrets().listSecretsWithImports({
            environment,
            projectId,
            secretPath: `${appsPath}/${app}`,
            expandSecretReferences: true,
            recursive: false
          });
          const keys = new Map(
            secrets.map((secret) => [secret.secretKey, secret.secretValue])
          );

          return {
            app,
            flyApp: flyAppName(app, environment, deployment),
            included: tenants !== 'excluded' && matchesDeployRule(app, appRule),
            apiKey: compareKey(keys.get('PAYLOAD_API_KEY'), apiKey),
            optionalKeys: OPTIONAL_KEYS.filter((key) => keys.has(key))
          };
        }
      )
    );

    return { environment, access: 'ok', tenants, apps };
  };

  return {
    deployment,
    checkedAt: new Date().toISOString(),
    environments: await Promise.all(environments.map(readEnvironment))
  };
}
