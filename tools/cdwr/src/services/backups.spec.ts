import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backupName, listBackups, parseBackupName, stamp } from './backups';

describe('backup names', () => {
  const date = new Date('2026-09-19T21:05:33.123Z');

  it('stamps without characters a path minds', () => {
    expect(stamp(date)).toBe('2026-09-19T21-05-33');
  });

  it('round-trips through the name', () => {
    const name = backupName('cms', 'production', date);
    expect(name).toBe('cms-production-2026-09-19T21-05-33');
    expect(parseBackupName(name)).toEqual({
      name,
      environment: 'production',
      takenAt: '2026-09-19T21:05:33Z'
    });
  });

  it('ignores folders of another kind or shape', () => {
    expect(
      parseBackupName('storage-preview-2026-09-19T21-05-33')
    ).toBeUndefined();
    expect(parseBackupName('cms-production')).toBeUndefined();
    expect(
      parseBackupName('storage-preview-2026-09-19T21-05-33', 'storage')
        ?.environment
    ).toBe('preview');
  });
});

describe('listBackups', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cdwr-backups-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns nothing when the folder does not exist', () => {
    expect(listBackups(root)).toEqual([]);
  });

  it('lists matching folders newest first', () => {
    for (const name of [
      'cms-preview-2026-01-01T00-00-00',
      'cms-production-2026-02-01T00-00-00',
      'storage-production-2026-03-01T00-00-00',
      'notes.txt'
    ]) {
      mkdirSync(join(root, 'backups', name), { recursive: true });
    }
    expect(listBackups(root).map((b) => b.name)).toEqual([
      'cms-production-2026-02-01T00-00-00',
      'cms-preview-2026-01-01T00-00-00'
    ]);
    expect(listBackups(root, 'storage')).toHaveLength(1);
  });
});
