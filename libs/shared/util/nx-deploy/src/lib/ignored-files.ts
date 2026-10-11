import { matchesGlob } from './glob';

/**
 * Files that never change what a deployed app does: documentation, agent
 * config and test-only files. A change confined to these deploys nothing.
 */
export const ignoredFiles = [
  '**/*.md',
  '**/*.mdx',
  '.claude/**',
  '**/*.{spec,test}.*',
  '**/*.stories.*',
  '**/__snapshots__/**',
  '**/test-setup.*'
] as const satisfies readonly string[];

/** Whether a changed file is irrelevant to a deployment */
export const isIgnoredFile = (path: string): boolean =>
  ignoredFiles.some((pattern) => matchesGlob(path, pattern));
