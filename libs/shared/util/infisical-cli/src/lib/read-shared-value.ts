import { exportShared } from './export-shared';
import { type InfisicalRunner, runInfisical } from './infisical-runner';

/**
 * The shared value of one key at a path, never a personal override;
 * undefined when the key is not there.
 *
 * A failure names the key, path and environment only: the runner's own error
 * can carry the CLI's stdout, which holds the secret values.
 */
export const readSharedValue = (
  {
    path,
    environment,
    key,
    projectId
  }: {
    path: string;
    environment: string;
    key: string;
    projectId?: string;
  },
  run: InfisicalRunner = runInfisical
): string | undefined => {
  return (
    exportShared(
      { path, environment, projectId },
      `infisical export failed reading ${key} at ${path} (${environment})`,
      run
    ).find((entry) => entry.key === key)?.value ?? undefined
  );
};
