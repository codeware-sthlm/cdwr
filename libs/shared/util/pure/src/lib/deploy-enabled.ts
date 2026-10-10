/** Name of the per-folder secret that switches a deployment on. */
export const DEPLOY_ENABLED_KEY = 'DEPLOY_ENABLED';

/**
 * Whether a `DEPLOY_ENABLED` value switches deployment on.
 *
 * Only `true` (case-insensitive, trimmed) counts. Absent means off, the safe
 * default for a new environment; a pause is an edit that keeps the folder's
 * other secrets.
 */
export const isDeployEnabled = (value: string | null | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';

const samePath = (a: string, b: string) =>
  a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/** The folder's own DEPLOY_ENABLED, ignoring one reached through an import or a subfolder */
export const ownDeployFlag = (
  secrets: ReadonlyArray<{
    secretKey: string;
    secretValue: string;
    secretPath?: string;
  }>,
  folderPath: string
): string | undefined =>
  secrets.find(
    (s) =>
      s.secretKey === DEPLOY_ENABLED_KEY &&
      (s.secretPath === undefined || samePath(s.secretPath, folderPath))
  )?.secretValue;
