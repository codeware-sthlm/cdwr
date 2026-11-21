import * as core from '@actions/core';
import {
  type InfisicalConfig,
  fetchDeployments
} from '@codeware/shared/feature/tenancy';
import { maskSecrets } from '@codeware/shared/util/github';
import type {
  AppDeploymentDetails,
  AppDetails,
  Environment
} from '@codeware/shared/util/nx-deploy';

/** A planned deployment with its secret values read from Infisical */
export type ResolvedDeploymentDetails = Omit<
  AppDeploymentDetails,
  'secretNames'
> & {
  secrets?: Record<string, string>;
  /** Why this deployment can't run; names secrets, never their values */
  error?: string;
};

export type ResolvedAppDetails = Record<
  string,
  Array<ResolvedDeploymentDetails>
>;

const label = (app: string, tenant?: string) =>
  tenant ? `${app} (${tenant})` : app;

/**
 * Read the secret values of the planned tenant deployments from Infisical.
 *
 * Pre-deploy hands over only secret names, since a job output is printed in
 * the log of every step that takes it. The plan decides which tenants deploy
 * and which secrets they need; this read only supplies the values:
 *
 * - a planned name missing from Infisical fails that deployment
 * - missing credentials, or a failed read, fail every deployment that names
 *   secrets; host apps and tenants without secrets still deploy
 * - a secret added since pre-deploy is ignored, with a warning
 *
 * Every value read is masked before anything else can log it. A run without
 * secret names never contacts Infisical.
 *
 * @param appDetails Deployments planned by pre-deploy
 * @param environment Deployment environment
 * @param infisical Infisical credentials, required only when a secret is named
 * @returns The planned deployments with their secrets or an error
 */
export const resolveTenantSecrets = async (
  appDetails: AppDetails,
  environment: Environment,
  infisical: Omit<InfisicalConfig, 'environment'> | undefined
): Promise<ResolvedAppDetails> => {
  const resolved: ResolvedAppDetails = Object.fromEntries(
    Object.entries(appDetails).map(([app, entries]) => [
      app,
      entries.map((entry) => {
        const copy = { ...entry };
        delete copy.secretNames;
        return copy;
      })
    ])
  );

  const named = Object.entries(appDetails).filter(([, entries]) =>
    entries.some((entry) => entry.secretNames?.length)
  );
  if (named.length === 0) {
    core.info('No tenant secrets planned, Infisical not contacted');
    return resolved;
  }

  const failNamed = (message: string) => {
    for (const [app, entries] of named) {
      entries.forEach((entry, index) => {
        if (entry.secretNames?.length) {
          resolved[app][index].error = message;
        }
      });
    }
    return resolved;
  };

  if (!infisical) {
    return failNamed(
      "Infisical credentials are required to read this deployment's secrets"
    );
  }

  let deployments: Awaited<ReturnType<typeof fetchDeployments>>['deployments'];
  try {
    ({ deployments } = await fetchDeployments(
      { ...infisical, environment },
      named.map(([app]) => app)
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`Could not read secrets from Infisical: ${message}`);
    return failNamed(`Could not read secrets from Infisical: ${message}`);
  }

  // Mask every value returned, also those the plan doesn't use
  maskSecrets(
    Object.values(deployments)
      .flat()
      .flatMap((entry) => Object.values(entry.secrets ?? {}))
  );

  for (const [app, entries] of named) {
    entries.forEach((entry, index) => {
      const secretNames = entry.secretNames ?? [];
      if (secretNames.length === 0) {
        return;
      }

      const target = label(app, entry.tenant);
      const fresh =
        deployments[app]?.find((d) => d.tenant === entry.tenant)?.secrets ?? {};

      const missing = secretNames.filter((name) => !Object.hasOwn(fresh, name));
      if (missing.length > 0) {
        resolved[app][index].error =
          `Secrets planned by pre-deploy are missing in Infisical: ${missing.join(', ')}`;
        return;
      }

      const added = Object.keys(fresh)
        .filter((name) => !secretNames.includes(name))
        .sort();
      if (added.length > 0) {
        core.warning(
          `${target}: ignoring secrets added after pre-deploy: ${added.join(', ')}`
        );
      }

      resolved[app][index].secrets = Object.fromEntries(
        secretNames.map((name) => [name, fresh[name]])
      );
      core.info(`${target}: read ${secretNames.length} secret(s)`);
    });
  }

  return resolved;
};
