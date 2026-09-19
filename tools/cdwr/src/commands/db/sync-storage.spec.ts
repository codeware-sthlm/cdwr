import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import { countSynced } from './sync-storage';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

describe('countSynced', () => {
  it('counts download and copy lines', () => {
    const stdout = [
      'download: s3://bucket/a.jpg to a.jpg',
      'copy: s3://bucket/b.jpg to b.jpg',
      'Completed 2 file(s)'
    ].join('\n');
    expect(countSynced(stdout)).toBe(2);
  });

  it('is zero for nothing synced', () => {
    expect(countSynced('')).toBe(0);
    expect(countSynced('\n')).toBe(0);
  });
});

const secrets: Record<string, string> = {
  S3_BUCKET: 'cms-media',
  S3_ACCESS_KEY_ID: 'AKIA',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_ENDPOINT: 'https://s3.example.com'
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must accept the forwarded args
const readSecrets = vi.fn(async (..._args: unknown[]) => secrets);
vi.mock('../../services/infisical', () => ({
  readSecrets: (...a: unknown[]) => readSecrets(...a)
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must accept the forwarded args
const run = vi.fn(async (..._args: unknown[]) => ({
  stdout: 'download: s3://cms-media/a.jpg to a.jpg\n',
  stderr: ''
}));
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: (...a: unknown[]) => run(...a) };
});

describe('db sync-storage', () => {
  let root: string;

  beforeEach(() => {
    run.mockClear();
    readSecrets.mockClear();
    root = mkdtempSync(join(tmpdir(), 'cdwr-sync-storage-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('syncs the bucket for an environment', async () => {
    const command = (await import('./sync-storage')).default;
    const exit = await runCommand({
      name: 'db sync-storage',
      command,
      argv: ['--env', 'preview'],
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(readSecrets).toHaveBeenCalledWith('preview', '/apps/cms');
    expect(run).toHaveBeenCalledWith(
      'aws',
      [
        's3',
        'sync',
        's3://cms-media',
        expect.stringContaining(join(root, 'backups/storage-preview-')),
        '--endpoint-url',
        'https://s3.example.com',
        '--region',
        'eu-central-1',
        '--no-progress'
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          AWS_ACCESS_KEY_ID: 'AKIA',
          AWS_SECRET_ACCESS_KEY: 'secret'
        })
      })
    );
  });

  it('fails when a secret is missing', async () => {
    readSecrets.mockResolvedValueOnce({ ...secrets, S3_BUCKET: '' });
    const command = (await import('./sync-storage')).default;
    const exit = await runCommand({
      name: 'db sync-storage',
      command,
      argv: ['--env', 'preview'],
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });
    expect(exit).toBe(EXIT.failed);
    expect(run).not.toHaveBeenCalled();
  });
});
