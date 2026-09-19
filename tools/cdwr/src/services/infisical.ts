import { randomUUID } from 'node:crypto';

import {
  type Environment,
  type Folder,
  type Secret,
  deleteInfisicalSecret as deleteSecret,
  withInfisical as readInfisical,
  setInfisicalSecret as setSecret
} from '@codeware/shared/feature/infisical';

import { messageOf } from '../cli/errors';
import { muted } from '../cli/muted';

export type { Environment, Folder, Secret };

// The lib narrates every call to stdout; commands print through the UI
export const setInfisicalSecret = (
  ...args: Parameters<typeof setSecret>
): ReturnType<typeof setSecret> => muted(() => setSecret(...args));

export const deleteInfisicalSecret = (
  ...args: Parameters<typeof deleteSecret>
): ReturnType<typeof deleteSecret> => muted(() => deleteSecret(...args));

/** Secrets at one path as a record */
export async function readSecrets(
  environment: Environment,
  path: string
): Promise<Record<string, string>> {
  const secrets = await muted(() =>
    readInfisical({ environment, filter: { path } })
  );
  return Object.fromEntries(
    (secrets ?? []).map(({ secretKey, secretValue }) => [
      secretKey,
      secretValue
    ])
  );
}

/** One secret, or an error naming what is missing where */
export async function readSecret(
  environment: Environment,
  path: string,
  key: string
): Promise<string> {
  const value = (await readSecrets(environment, path))[key];
  if (!value) {
    throw new Error(
      `${key} not found in Infisical at ${path} (${environment})`
    );
  }
  return value;
}

/** Folders under a path, with their secrets, as the deploy reads them */
export async function readFolders(
  environment: Environment,
  path: string
): Promise<Array<{ path: string; secrets: Secret[] }>> {
  const folders = await muted(() =>
    readInfisical({
      environment,
      filter: { path, recurse: true },
      groupByFolder: true
    })
  );
  return (folders ?? []).map((folder) => ({
    path: folder.path,
    secrets: folder.secrets
  }));
}

export interface TenantApp {
  app: string;
  secrets: Record<string, string>;
}

/** What `/tenants/<id>/apps/<app>` holds, keyed by tenant id */
export type TenantDeployments = Map<string, TenantApp[]>;

const TENANT_APP = /^\/tenants\/([^/]+)\/apps\/([^/]+)$/;

/** Group tenant app folders by tenant id; pure, for tests */
export function groupTenantApps(
  folders: Array<{ path: string; secrets: Secret[] }>
): TenantDeployments {
  const tenants: TenantDeployments = new Map();
  for (const folder of folders) {
    const match = folder.path.match(TENANT_APP);
    if (!match) continue;
    const [, tenantId, app] = match as [string, string, string];
    const list = tenants.get(tenantId) ?? [];
    list.push({
      app,
      secrets: Object.fromEntries(
        folder.secrets.map(({ secretKey, secretValue }) => [
          secretKey,
          secretValue
        ])
      )
    });
    tenants.set(tenantId, list);
  }
  return tenants;
}

/** Every tenant deployment an environment holds */
export async function readTenantDeployments(
  environment: Environment
): Promise<TenantDeployments> {
  return groupTenantApps(await readFolders(environment, '/tenants'));
}

/**
 * Prove Infisical will accept an edit at a path before anything depends on it.
 * A real edit of a throwaway secret: written, changed, read back, removed.
 * Writing an existing value back would prove nothing, because a write that
 * fails but leaves the stored value matching looks like success.
 */
export async function assertWritable(
  environment: Environment,
  path: string
): Promise<void> {
  const key = 'ROTATION_WRITE_CHECK';
  const write = (value: string) =>
    setInfisicalSecret({ environment, path, key, value });
  try {
    await write(`probe-${randomUUID()}`);
    const expected = `probe-${randomUUID()}`;
    await write(expected);
    const stored = (await readSecrets(environment, path))[key];
    if (stored !== expected) throw new Error('the edit did not take effect');
  } catch (error) {
    throw new Error(
      `Infisical will not accept writes at ${path}: ${messageOf(error)}`
    );
  } finally {
    await deleteInfisicalSecret({ environment, path, key });
  }
}

/** Mask a value for output that must not leak it */
export const mask = (value: string): string =>
  value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-2)}`;

/** A record with every value masked, for `infisical data` without --reveal */
export const maskValues = (
  secrets: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, mask(v)]));
