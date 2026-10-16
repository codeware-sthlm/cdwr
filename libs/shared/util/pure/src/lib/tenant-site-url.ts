import { getAppName } from './get-app-name';

/**
 * The address a tenant's site answers on at Fly: the host app's name joined
 * with the deployment, the way tenant apps are named.
 *
 * @param hostAppName - Name of the host app, e.g. `cdwr-cms`
 * @param deployment - The tenant's deployment name
 */
export const tenantSiteUrl = (
  hostAppName: string,
  deployment: string
): string =>
  `https://${getAppName({
    environment: 'production',
    configAppName: hostAppName,
    tenantId: deployment
  })}.fly.dev`;
