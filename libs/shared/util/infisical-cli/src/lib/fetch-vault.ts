import { discoverPaths } from './discover-paths';
import {
  type InfisicalRunner,
  parseJsonOutput,
  runInfisical
} from './infisical-runner';

const readPath = (
  path: string,
  environment: string,
  run: InfisicalRunner
): Record<string, string> => {
  const exported = parseJsonOutput(
    run([
      'export',
      `--env=${environment}`,
      `--path=${path}`,
      '--format=json',
      '--silent'
    ]),
    `export of ${path}`
  );

  const values: Record<string, string> = {};
  if (!Array.isArray(exported)) return values;

  for (const entry of exported) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'key' in entry &&
      'value' in entry &&
      typeof entry.key === 'string' &&
      typeof entry.value === 'string'
    ) {
      values[entry.key] = entry.value;
    }
  }
  return values;
};

/**
 * Every value under the path, merged in discovery order, so a deeper path
 * wins on a duplicate key. Also returns the paths that were read. Pass
 * `known` paths to skip discovery.
 */
export const fetchVault = (
  path: string,
  environment: string,
  run: InfisicalRunner = runInfisical,
  known?: string[]
): { values: Record<string, string>; paths: string[] } => {
  const paths = known ?? discoverPaths(path, environment, run);
  const values: Record<string, string> = {};
  for (const from of paths) {
    Object.assign(values, readPath(from, environment, run));
  }
  return { values, paths };
};
