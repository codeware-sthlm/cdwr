import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { parse } from 'dotenv';

/**
 * The files Nx may load for a task, highest priority first, relative to the
 * workspace root. Mirrors `getEnvPathsForTask` in
 * `nx/src/tasks-runner/task-env-paths`, which Nx does not export.
 */
export const nxEnvFiles = (
  projectRoot: string,
  target: string,
  configuration?: string,
  nonAtomizedTarget?: string
): string[] => {
  const identifiers: string[] = [];
  if (configuration) {
    identifiers.push(`${target}.${configuration}`);
    if (nonAtomizedTarget)
      identifiers.push(`${nonAtomizedTarget}.${configuration}`);
    identifiers.push(configuration);
  }
  identifiers.push(target);
  if (nonAtomizedTarget) identifiers.push(nonAtomizedTarget);
  identifiers.push('');

  const variants = (identifier: string, root?: string): string[] => {
    const path = root ? `${root}/` : '';
    return identifier
      ? [
          `${path}.env.${identifier}.local`,
          `${path}.env.${identifier}`,
          `${path}.${identifier}.local.env`,
          `${path}.${identifier}.env`
        ]
      : [`${path}.env.local`, `${path}.local.env`, `${path}.env`];
  };

  return [
    ...identifiers.flatMap((identifier) => variants(identifier, projectRoot)),
    ...identifiers.flatMap((identifier) => variants(identifier))
  ];
};

/** `.env.local`, `.local.env`, `.env.<id>.local` — personal overrides, not committed */
const isLocalOverride = (file: string): boolean =>
  /(^|\.)local(\.|$)/.test(basename(file));

/** The files Nx loads for the task that exist, in Nx's order, with the committed and the local ones also apart */
export const taskEnvFiles = (input: {
  workspaceRoot: string;
  /** Relative to the workspace root */
  projectRoot: string;
  target: string;
  configuration?: string;
  nonAtomizedTarget?: string;
}): { all: string[]; committed: string[]; local: string[] } => {
  const files = nxEnvFiles(
    input.projectRoot,
    input.target,
    input.configuration,
    input.nonAtomizedTarget
  )
    .map((file) => join(input.workspaceRoot, file))
    .filter((file) => existsSync(file));

  return {
    all: files,
    committed: files.filter((file) => !isLocalOverride(file)),
    local: files.filter(isLocalOverride)
  };
};

/**
 * What the files contribute, parsed as Nx does. Nx loads them in order without
 * overriding, so the first file to set a key wins.
 */
export const readEnvFiles = (files: string[]): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const file of files) {
    for (const [key, value] of Object.entries(
      parse(readFileSync(file, 'utf8'))
    )) {
      if (!(key in values)) values[key] = value;
    }
  }
  return values;
};

/** The committed `.env` files' values; pass `taskEnvFiles(...).committed` */
export const readCommittedEnv = (files: string[]): Record<string, string> =>
  readEnvFiles(files);
