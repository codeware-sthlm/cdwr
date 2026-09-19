import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import { filesFor } from './restore';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/backups', () => ({
  listBackups: vi.fn(() => [
    {
      name: 'cms-production-2026-09-19T21-05-33',
      environment: 'production',
      takenAt: '2026-09-19T21:05:33Z'
    }
  ])
}));

vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://pooler/cms')
}));

vi.mock('../../services/fly', () => ({
  listPreviewCmsApps: vi.fn(async () => ['cdwr-cms-pr-42']),
  pullRequestOf: vi.fn(() => undefined)
}));

vi.mock('../../services/github', () => ({
  currentPullRequest: vi.fn(async () => undefined)
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must accept the forwarded args
const run = vi.fn(async (..._args: unknown[]) => ({ stdout: '', stderr: '' }));
vi.mock('../../services/shell', () => ({
  run: (...args: unknown[]) => run(...args)
}));

describe('filesFor', () => {
  it('applies schema then data for a full restore', () => {
    expect(filesFor('full')).toEqual(['schema.sql', 'data.sql']);
  });

  it('applies only the named file otherwise', () => {
    expect(filesFor('schema')).toEqual(['schema.sql']);
    expect(filesFor('data')).toEqual(['data.sql']);
  });
});

describe('db restore', () => {
  beforeEach(() => {
    run.mockClear();
  });

  it('restores schema then data and asks for the typed name on production', async () => {
    const command = (await import('./restore')).default;
    const exit = await runCommand({
      name: 'db restore',
      command,
      argv: [
        'cms-production-2026-09-19T21-05-33',
        '--mode',
        'full',
        '--env',
        'production'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi(['production']),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, 'psql', [
      'postgres://pooler/cms',
      '--set',
      'ON_ERROR_STOP=on',
      '--file=/repo/backups/cms-production-2026-09-19T21-05-33/schema.sql',
      '--no-password'
    ]);
    expect(run).toHaveBeenNthCalledWith(2, 'psql', [
      'postgres://pooler/cms',
      '--set',
      'ON_ERROR_STOP=on',
      '--file=/repo/backups/cms-production-2026-09-19T21-05-33/data.sql',
      '--no-password'
    ]);
  });

  it('restores only the requested part', async () => {
    const command = (await import('./restore')).default;
    const exit = await runCommand({
      name: 'db restore',
      command,
      argv: [
        'cms-production-2026-09-19T21-05-33',
        '--mode',
        'data',
        '--env',
        'production',
        '--yes'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('psql', [
      'postgres://pooler/cms',
      '--set',
      'ON_ERROR_STOP=on',
      '--file=/repo/backups/cms-production-2026-09-19T21-05-33/data.sql',
      '--no-password'
    ]);
  });

  it('resolves a preview restore against the chosen Fly app, not Infisical', async () => {
    const { resolveDatabaseUrl } = await import('../../services/database');
    const command = (await import('./restore')).default;
    const exit = await runCommand({
      name: 'db restore',
      command,
      argv: [
        'cms-production-2026-09-19T21-05-33',
        '--mode',
        'data',
        '--env',
        'preview',
        '--preview-app',
        'cdwr-cms-pr-42',
        '--yes'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(resolveDatabaseUrl).toHaveBeenCalledWith(
      'preview',
      'cdwr-cms-pr-42'
    );
  });
});
