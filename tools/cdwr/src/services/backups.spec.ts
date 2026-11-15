import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  backupName,
  dumpCms,
  listBackups,
  parseBackupName,
  pruneBackups,
  stamp
} from './backups';
import { run } from './shell';

vi.mock('./shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shell')>()),
  run: vi.fn()
}));

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

describe('pruneBackups', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cdwr-backups-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('keeps the newest N and leaves everything that is not a backup', () => {
    const names = [
      'cms-production-2026-01-01T00-00-00',
      'cms-production-2026-01-02T00-00-00',
      'cms-production-2026-01-03T00-00-00',
      'cms-production-2026-01-04T00-00-00',
      'storage-production-2026-01-01T00-00-00',
      'notes'
    ];
    for (const name of names) {
      mkdirSync(join(root, 'backups', name), { recursive: true });
    }
    expect(pruneBackups(root, 2)).toEqual([
      'cms-production-2026-01-02T00-00-00',
      'cms-production-2026-01-01T00-00-00'
    ]);
    expect(listBackups(root).map((b) => b.name)).toEqual([
      'cms-production-2026-01-04T00-00-00',
      'cms-production-2026-01-03T00-00-00'
    ]);
    expect(existsSync(join(root, 'backups', 'notes'))).toBe(true);
    expect(listBackups(root, 'storage')).toHaveLength(1);
  });

  it('removes nothing when there are no more than N', () => {
    mkdirSync(join(root, 'backups', 'cms-production-2026-01-01T00-00-00'), {
      recursive: true
    });
    expect(pruneBackups(root, 7)).toEqual([]);
    expect(pruneBackups(root, 7, 'storage')).toEqual([]);
  });
});

describe('dumpCms', () => {
  const url = 'postgres://dumper:s3cret@db.internal:5433/cms?sslmode=require';
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cdwr-dump-'));
    vi.mocked(run).mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('dumps schema then data, the url only in the libpq environment', async () => {
    const dir = join(root, 'dump');
    await dumpCms({ url, dir });
    const calls = vi.mocked(run).mock.calls;
    expect(calls.map(([bin, args]) => [bin, args])).toEqual([
      [
        'pg_dump',
        [
          '--schema-only',
          '--no-acl',
          '--no-owner',
          `--file=${join(dir, 'schema.sql')}`
        ]
      ],
      [
        'pg_dump',
        [
          '--data-only',
          '--no-acl',
          '--no-owner',
          `--file=${join(dir, 'data.sql')}`
        ]
      ]
    ]);
    for (const [, args, options] of calls) {
      expect(JSON.stringify(args)).not.toMatch(/s3cret|postgres:|dumper/);
      expect(options?.env).toMatchObject({
        PGHOST: 'db.internal',
        PGPORT: '5433',
        PGUSER: 'dumper',
        PGPASSWORD: 's3cret',
        PGDATABASE: 'cms',
        PGSSLMODE: 'require'
      });
    }
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('passes --schema when given', async () => {
    await dumpCms({ url, dir: join(root, 'dump'), schema: 'payload' });
    for (const [, args] of vi.mocked(run).mock.calls) {
      expect(args).toContain('--schema=payload');
    }
  });

  it('rejects a url that is not postgres without running pg_dump', async () => {
    await expect(
      dumpCms({ url: 'mysql://u:p@h/db', dir: join(root, 'dump') })
    ).rejects.toThrow('not a postgres:// url');
    expect(run).not.toHaveBeenCalled();
  });
});
