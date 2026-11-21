import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InfisicalMissingError,
  type InfisicalRunner,
  runInfisical
} from './infisical-runner';
import { readKeyLengths } from './read-key-lengths';

export interface SecretTarget {
  path: string;
  environment: string;
  key: string;
  projectId?: string;
}

const PROBE_KEY_PREFIX = 'ROTATION_WRITE_CHECK_';

/**
 * Writes a shared secret, handing the CLI a file so the value never reaches
 * argv or the process list. The file is removed afterwards.
 *
 * A failure names key, path and environment only: the runner's own error can
 * carry the CLI's output.
 */
export const setSecretFromFile = (
  {
    path,
    environment,
    key,
    value,
    projectId
  }: SecretTarget & { value: string },
  run: InfisicalRunner = runInfisical
): void => {
  const dir = mkdtempSync(join(tmpdir(), 'cdwr-secret-'));
  try {
    const file = join(dir, 'value');
    writeFileSync(file, value, { mode: 0o600 });
    run([
      'secrets',
      'set',
      `${key}=@${file}`,
      `--env=${environment}`,
      `--path=${path}`,
      '--type=shared',
      '--silent',
      ...(projectId ? [`--projectId=${projectId}`] : [])
    ]);
  } catch (error) {
    if (error instanceof InfisicalMissingError) throw error;
    throw new Error(
      `infisical secrets set failed for ${key} at ${path} (${environment})`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Deletes a shared secret; a failure names key, path and environment only */
export const deleteSecret = (
  { path, environment, key, projectId }: SecretTarget,
  run: InfisicalRunner = runInfisical
): void => {
  try {
    run([
      'secrets',
      'delete',
      key,
      `--env=${environment}`,
      `--path=${path}`,
      '--type=shared',
      '--silent',
      ...(projectId ? [`--projectId=${projectId}`] : [])
    ]);
  } catch (error) {
    if (error instanceof InfisicalMissingError) throw error;
    throw new Error(
      `infisical secrets delete failed for ${key} at ${path} (${environment})`
    );
  }
};

/** Proves Infisical takes a write at the path: sets a unique throwaway key, reads it back, removes it */
export const probeWrite = (
  { path, environment, projectId }: Omit<SecretTarget, 'key'>,
  run: InfisicalRunner = runInfisical
): void => {
  const key = `${PROBE_KEY_PREFIX}${randomBytes(8).toString('hex').toUpperCase()}`;
  const target = { path, environment, key, projectId };
  const value = randomBytes(16).toString('hex');
  let failure: unknown;
  try {
    setSecretFromFile({ ...target, value }, run);
    const found = readKeyLengths(path, environment, run, projectId).find(
      (entry) => entry.key === key
    );
    if (found?.length !== value.length) throw new Error('read back differs');
  } catch (error) {
    failure = error;
  }
  try {
    deleteSecret(target, run);
  } catch (error) {
    if (error instanceof InfisicalMissingError) throw error;
    // The write check's own failure stands
    if (!failure) {
      throw new Error(
        `Infisical took the write at ${path} (${environment}), but the check key ${key} could not be removed; delete it by hand`
      );
    }
  }
  if (failure) {
    if (failure instanceof InfisicalMissingError) throw failure;
    throw new Error(
      `Infisical will not accept writes at ${path} (${environment})`
    );
  }
};
