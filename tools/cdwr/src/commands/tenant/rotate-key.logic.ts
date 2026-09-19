import { reported } from '../../services/database';
import type { TenantApp } from '../../services/infisical';

export interface TenantKeySummary {
  /** App folders holding a `PAYLOAD_API_KEY`, all of which must be updated */
  apps: string[];
  /** Distinct key values found across those folders */
  apiKeys: string[];
}

/**
 * Which of a tenant's app folders hold a `PAYLOAD_API_KEY`, and the distinct
 * values found. Every app folder holding one has to be updated, otherwise
 * that deployment authenticates with the retired key.
 */
export function summarizeTenantKeys(
  apps: ReadonlyArray<TenantApp>
): TenantKeySummary {
  const withKey = apps.filter(({ secrets }) => secrets['PAYLOAD_API_KEY']);
  return {
    apps: withKey.map(({ app }) => app),
    apiKeys: [
      ...new Set(
        withKey.map(({ secrets }) => secrets['PAYLOAD_API_KEY'] as string)
      )
    ]
  };
}

/**
 * The key identifies the tenant, so the folders disagreeing means it is not
 * knowable which one the deployments actually authenticate with.
 */
export const apiKeyMismatch = (apiKeys: ReadonlyArray<string>): boolean =>
  apiKeys.length > 1;

/**
 * Whether a failure happened before the script touched the tenant.
 *
 * The script reports `RESOLVED_TENANT` as soon as it has found the tenant and
 * `ROTATED_API_KEY` once it has written, so a failure carrying neither means
 * it never got past connecting - nothing was changed and retrying is safe.
 */
export const isPreWriteFailure = (message: string): boolean =>
  !message.includes('RESOLVED_TENANT=') &&
  !message.includes('ROTATED_API_KEY=') &&
  /exited early|did not report a result/.test(message);

export interface RotationOutput {
  apiKey: string;
  slug: string | undefined;
}

/** The tenant and key a rotation script reported on its own marker lines */
export function parseRotationOutput(stdout: string): RotationOutput {
  return {
    apiKey: reported(stdout, 'ROTATED_API_KEY')?.trim() ?? '',
    slug: reported(stdout, 'RESOLVED_TENANT')?.trim()
  };
}

export interface FlyAppTarget {
  app: string;
  flyApp: string;
}

/** The Fly app name of each app a tenant deploys, from an injected namer */
export function tenantFlyApps(
  apps: ReadonlyArray<string>,
  namer: (app: string) => string
): FlyAppTarget[] {
  return apps.map((app) => ({ app, flyApp: namer(app) }));
}
