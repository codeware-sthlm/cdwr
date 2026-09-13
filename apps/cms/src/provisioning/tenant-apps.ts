/** Apps a workspace can be deployed with, named as their Infisical folders */
export const TENANT_APPS = ['cms', 'web'] as const;

export type TenantApp = (typeof TENANT_APPS)[number];

/**
 * Each app's Fly config name, mirrored from its `fly.toml`.
 *
 * The image does not ship the config, so the running app cannot read it. The
 * sibling spec compares these with the files, so a rename cannot drift.
 */
export const FLY_CONFIG_APP_NAMES: Record<TenantApp, string> = {
  cms: 'cdwr-cms',
  web: 'cdwr-web'
};
