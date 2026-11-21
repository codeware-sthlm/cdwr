import type { AppDetails } from '@codeware/shared/util/nx-deploy';

/**
 * App details without the tenants' env values, which `env=true` declares
 * non-secret. Masking one would also drop the job's `apps` output when the
 * same value, such as a Sentry DSN, appears there.
 */
export const withoutTenantEnv = (details: AppDetails): AppDetails =>
  Object.fromEntries(
    Object.entries(details).map(([app, deployments]) => [
      app,
      deployments.map(({ tenant, secretNames }) => ({
        ...(tenant !== undefined && { tenant }),
        ...(secretNames && { secretNames })
      }))
    ])
  );
