import { exportShared } from './export-shared';
import { type InfisicalRunner, runInfisical } from './infisical-runner';

export interface KeyLength {
  key: string;
  /** null when only your personal override came back */
  length: number | null;
}

/**
 * The keys at a path with the length of each shared value, never the value.
 *
 * A failure names the path and environment only: the runner's own error can
 * carry the CLI's stdout, which holds the secret values.
 */
export const readKeyLengths = (
  path: string,
  environment: string,
  run: InfisicalRunner = runInfisical,
  projectId?: string
): KeyLength[] => {
  return exportShared(
    { path, environment, projectId },
    `infisical export failed for ${path} (${environment})`,
    run
  ).map(({ key, value }) => ({ key, length: value?.length ?? null }));
};
