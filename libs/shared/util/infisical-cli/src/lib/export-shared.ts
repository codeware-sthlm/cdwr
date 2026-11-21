import {
  InfisicalMissingError,
  type InfisicalRunner,
  parseJsonOutput,
  runInfisical
} from './infisical-runner';

export interface ExportedEntry {
  key: string;
  /** The shared value; null when only your personal override came back */
  value: string | null;
}

/**
 * The entries at a path, one per key: the shared value, or null for a key with
 * only a personal override. Malformed entries are dropped.
 *
 * Throws `failure` when the CLI fails: the runner's own error can carry its
 * stdout, which holds the secret values. A missing CLI is rethrown as it is.
 */
export const exportShared = (
  {
    path,
    environment,
    projectId
  }: { path: string; environment: string; projectId?: string },
  failure: string,
  run: InfisicalRunner = runInfisical
): ExportedEntry[] => {
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
  } catch (error) {
    if (error instanceof InfisicalMissingError) throw error;
    throw new Error(failure);
  }

  const exported = parseJsonOutput(
    output,
    `export of ${path} (${environment})`
  );
  if (!Array.isArray(exported)) return [];

  const entries = new Map<string, string | null>();
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
      entries.set(entry.key, entry.value);
    } else if (entry.type === 'personal' && !entries.has(entry.key)) {
      // A user login can get its own override in place of the shared value
      entries.set(entry.key, null);
    }
  }
  return [...entries].map(([key, value]) => ({ key, value }));
};
