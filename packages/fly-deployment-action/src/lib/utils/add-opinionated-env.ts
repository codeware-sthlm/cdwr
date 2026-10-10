/**
 * Add opinionated environment variables to the environment
 *
 * - `APP_NAME`
 * - `FLY_URL`
 * - `PR_NUMBER`
 * - `TENANT_ID` (if applicable)
 *
 * @param appName - The name of the app
 * @param prNumber - The pull request number
 * @param tenantId - The tenant ID (if applicable)
 * @param env - The current environment variables to append to (not mutated)
 * @returns The environment variables with the opinionated environment variables added
 */
export const addOpinionatedEnv = (
  {
    appName,
    prNumber,
    tenantId
  }: {
    appName: string;
    prNumber: number | undefined;
    tenantId: string | undefined;
  },
  env?: Record<string, string>
): Record<string, string> => {
  let newEnv: Record<string, string> = {
    ...env,
    APP_NAME: appName,
    PR_NUMBER: prNumber ? String(prNumber) : ''
  };

  // A host deployment has no tenant and gets no TENANT_ID
  if (tenantId) {
    newEnv = { ...newEnv, TENANT_ID: tenantId };
  }

  // Add FLY_URL - computed from app name (follows Fly.io subdomain pattern)
  // Format: https://{app-name}.fly.dev
  newEnv = { ...newEnv, FLY_URL: `https://${appName}.fly.dev` };

  return newEnv;
};
