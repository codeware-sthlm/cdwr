import * as exec from '@actions/exec';
import { getPackageManagerCommand } from '@nx/devkit';

import { git } from './git';
import { isIgnoredFile } from './ignored-files';

/**
 * Bytes per `--files` argument. Linux refuses a single argument over 128 KiB
 * (MAX_ARG_STRLEN), so stay well below it whatever the path lengths.
 */
const MAX_ARG_BYTES = 64 * 1024;

/** Comma-joined lists, each at most `MAX_ARG_BYTES` long */
export const chunkFiles = (files: string[]): string[] => {
  const chunks: string[] = [];
  let current = '';
  for (const file of files) {
    const next = current === '' ? file : `${current},${file}`;
    if (current !== '' && Buffer.byteLength(next) > MAX_ARG_BYTES) {
      chunks.push(current);
      current = file;
    } else {
      current = next;
    }
  }
  if (current !== '') {
    chunks.push(current);
  }
  return chunks;
};

export type GetChangedAppsOptions = {
  /** Start of the range, exclusive */
  base: string;
  /** End of the range */
  head: string;
  /** Candidate app project names */
  apps: string[];
};

/**
 * Find the apps whose runtime is touched by the changes in a range.
 *
 * Files that cannot change runtime behaviour (docs, agent config, tests) are
 * dropped first. What remains is handed to Nx, which resolves the projects
 * affected through the project graph, so a shared lib change reaches every app
 * that uses it.
 *
 * @returns The subset of `apps` that changed, in the order given
 */
export const getChangedApps = async ({
  base,
  head,
  apps
}: GetChangedAppsOptions): Promise<string[]> => {
  const diff = await git([
    '-c',
    'core.quotepath=off',
    'diff',
    '--name-only',
    base,
    head
  ]);

  const files = diff
    .split('\n')
    .filter((file) => file !== '' && !isIgnoredFile(file));

  if (files.length === 0) {
    return [];
  }

  const pmc = getPackageManagerCommand();
  const affected = new Set<string>();

  // One `--files` argument per call stays far below Linux's 128 KiB limit on a
  // single argument; a range from the root commit lists thousands of files
  for (const list of chunkFiles(files)) {
    const { stdout } = await exec.getExecOutput(
      pmc.exec,
      ['nx', 'show', 'projects', '--affected', '--files', list, '--json'],
      { silent: true }
    );
    for (const project of JSON.parse(stdout) as string[]) {
      affected.add(project);
    }
    if (apps.every((app) => affected.has(app))) {
      break;
    }
  }

  return apps.filter((app) => affected.has(app));
};
