import * as core from '@actions/core';
import {
  type InfisicalConfig,
  fetchDeployments
} from '@codeware/shared/feature/tenancy';
import { maskSecrets } from '@codeware/shared/util/github';
import type { AppDetails, Environment } from '@codeware/shared/util/nx-deploy';

/** A planned deployment with its secret values read from Infisical */
export type ResolvedDeploymentDetails = {
  tenant?: string;
  env?: Record<string, string>;
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
 * - a secret added since pre-deploy is ignored, with a warning
 *
 * Every value read is masked before anything else can log it. A run without
 * secret names never contacts Infisical.
 *
 * @param appDetails Deployments planned by pre-deploy
 * @param environment Deployment environment
 * @param infisical Infisical credentials, required only when a secret is named
 * @returns The planned deployments with their secrets
 * @throws When secrets are named but no credentials are given
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

  if (!infisical) {
    const targets = named.flatMap(([app, entries]) =>
      entries
        .filter((entry) => entry.secretNames?.length)
        .map((entry) => label(app, entry.tenant))
    );
    throw new Error(
      `Infisical credentials are required to read the secrets of ${targets.join(', ')}`
    );
  }

  const { deployments } = await fetchDeployments(
    { ...infisical, environment },
    named.map(([app]) => app)
  );

  // Mask all of it, also what the plan doesn't use: fetching put it in memory
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

      const missing = secretNames.filter((name) => !(name in fresh));
      if (missing.length > 0) {
        resolved[app][index].error =
          `Secrets planned by pre-deploy are missing in Infisical: ${missing.join(', ')}`;
        core.error(`${target}: ${resolved[app][index].error}`);
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
