import {
  type InfisicalRunner,
  parseJsonOutput,
  runInfisical
} from './infisical-runner';

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
    throw new Error(`infisical export failed for ${path} (${environment})`);
  }

  const exported = parseJsonOutput(output, `export of ${path}`);
  if (!Array.isArray(exported)) return [];

  const lengths = new Map<string, number | null>();
  for (const entry of exported) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('type' in entry) ||
      !('key' in entry) ||
      typeof entry.key !== 'string'
    ) {
      continue;
    }
    if (
      entry.type === 'shared' &&
      'value' in entry &&
      typeof entry.value === 'string'
    ) {
      lengths.set(entry.key, entry.value.length);
    } else if (entry.type === 'personal' && !lengths.has(entry.key)) {
      // A user login can get its own override in place of the shared value
      lengths.set(entry.key, null);
    }
  }
  return [...lengths].map(([key, length]) => ({ key, length }));
};
