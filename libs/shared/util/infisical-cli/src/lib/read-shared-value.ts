import {
  type InfisicalRunner,
  parseJsonOutput,
  runInfisical
} from './infisical-runner';

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
  let output: string;
  try {
    output = run([
      'export',
      `--env=${environment}`,
      `--path=${path}`,
      '--format=json',
      '--silent',
      '--include-imports=false',
      ...(projectId ? [`--projectId=${projectId}`] : [])
    ]);
  } catch {
    throw new Error(
      `infisical export failed reading ${key} at ${path} (${environment})`
    );
  }

  const exported = parseJsonOutput(
    output,
    `export of ${path} (${environment})`
  );
  if (!Array.isArray(exported)) return undefined;
  for (const entry of exported) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'type' in entry &&
      entry.type === 'shared' &&
      'key' in entry &&
      entry.key === key &&
      'value' in entry &&
      typeof entry.value === 'string'
    ) {
      return entry.value;
    }
  }
  return undefined;
};
