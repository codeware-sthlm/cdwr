import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
