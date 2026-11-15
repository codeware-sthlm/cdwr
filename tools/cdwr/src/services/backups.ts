import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { libpqEnv } from './libpq';
import { childEnv, run } from './shell';

/** Backups live beside the workspace, git-ignored */
export const backupsRoot = (root: string): string => join(root, 'backups');

/** `2026-09-19T21-05-33`: sortable, safe in a path */
export const stamp = (date: Date = new Date()): string =>
  date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/:/g, '-');

/** `cms-production-2026-09-19T21-05-33` */
export const backupName = (
  kind: 'cms' | 'storage',
  environment: string,
  date?: Date
): string => `${kind}-${environment}-${stamp(date)}`;

export interface Backup {
  name: string;
  environment: string;
  takenAt: string;
}

/** Parse a backup folder name; undefined when it is not one */
export function parseBackupName(
  name: string,
  kind: 'cms' | 'storage' = 'cms'
): Backup | undefined {
  const match = name.match(
    new RegExp(`^${kind}-([a-z]+)-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})$`)
  );
  if (!match) return undefined;
  const [, environment, taken] = match as [string, string, string];
  return {
    name,
    environment,
    takenAt: taken.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3Z')
  };
}

/** Backups of a kind under the root, newest first */
export function listBackups(
  root: string,
  kind: 'cms' | 'storage' = 'cms'
): Backup[] {
  const dir = backupsRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseBackupName(entry.name, kind))
    .filter((b): b is Backup => b !== undefined)
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Delete all but the newest `keep` backups of a kind; only folders that parse
 * as a backup are touched. Returns the names removed.
 */
export function pruneBackups(
  root: string,
  keep: number,
  kind: 'cms' | 'storage' = 'cms'
): string[] {
  const doomed = listBackups(root, kind)
    .slice(Math.max(0, keep))
    .map((b) => b.name);
  for (const name of doomed) {
    rmSync(join(backupsRoot(root), name), { recursive: true, force: true });
  }
  return doomed;
}

/**
 * Dump a CMS database into `dir` as `schema.sql` and `data.sql`, optionally
 * only one schema. The url goes to pg_dump through libpq's environment, never
 * its arguments. The folder is owner-only (0700), which also guards the files
 * pg_dump creates inside it.
 */
export async function dumpCms(options: {
  url: string;
  dir: string;
  schema?: string;
}): Promise<void> {
  const { url, dir, schema } = options;
  const env = childEnv(process.env, libpqEnv(url));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const part of ['schema', 'data'] as const) {
    await run(
      'pg_dump',
      [
        part === 'schema' ? '--schema-only' : '--data-only',
        '--no-acl',
        '--no-owner',
        ...(schema ? [`--schema=${schema}`] : []),
        `--file=${join(dir, `${part}.sql`)}`
      ],
      { env }
    );
  }
}
