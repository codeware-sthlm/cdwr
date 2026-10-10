type Options = {
  /** Deployment environment */
  environment: 'preview' | 'production';

  /** Fly config app name */
  configAppName: string;

  /** Pull request number */
  pullRequest?: number;

  /** Tenant ID when multi-tenancy is used */
  tenantId?: string;
};

/**
 * Get the name of the app.
 *
 * Preview apps should always get a name based on pull request numbers.
 *
 * E.g. `<config-app-name>-pr-<pull-request-number>`
 *
 * Compared to production apps: `<config-app-name>`.
 *
 * For tenant apps, add the tenant ID suffix to keep them separated
 * for the same base app name.
 *
 * E.g.
 * - `<config-app-name>-pr-<pull-request-number>-<tenant-id>`
 * - `<config-app-name>-<tenant-id>`
 *
 * @param options - Options
 * @returns The name of the app
 * @throws Error if pull request number is missing for preview environment
 */
export const getAppName = (options: Options) => {
  const { environment, configAppName, pullRequest, tenantId } = options;

  // Prevent preview apps from having production names
  if (environment == 'preview' && !pullRequest) {
    throw new Error(`Pull request number is required for preview environment`);
  }

  const baseAppName = pullRequest
    ? `${configAppName}-pr-${pullRequest}`
    : configAppName;

  return tenantId ? `${baseAppName}-${tenantId}` : baseAppName;
};
