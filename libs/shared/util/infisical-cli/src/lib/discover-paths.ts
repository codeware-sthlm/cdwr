import {
  type InfisicalRunner,
  parseJsonOutput,
  runInfisical
} from './infisical-runner';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Folder names directly under a path; an empty folder lists as `[]` or `null` */
export const listFolders = (
  path: string,
  environment: string,
  run: InfisicalRunner = runInfisical
): string[] => {
  const listing = parseJsonOutput(
    run([
      'secrets',
      'folders',
      'get',
      `--path=${path}`,
      `--env=${environment}`,
      '-o',
      'json',
      '--silent'
    ]),
    `folders of ${path}`
  );

  if (!Array.isArray(listing)) return [];

  return listing.flatMap((folder: unknown) =>
    isRecord(folder) && typeof folder['folderName'] === 'string'
      ? [folder['folderName']]
      : []
  );
};

/**
 * The path plus every sub-folder, parent first, depth-first.
 *
 * Discovered rather than listed by hand: `infisical export` cannot recurse,
 * and a hand-typed list misses new folders silently.
 */
export const discoverPaths = (
  path: string,
  environment: string,
  run: InfisicalRunner = runInfisical
): string[] => [
  path,
  ...listFolders(path, environment, run).flatMap((name) =>
    discoverPaths(`${path.replace(/\/$/, '')}/${name}`, environment, run)
  )
];
