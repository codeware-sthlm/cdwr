import * as exec from '@actions/exec';

import { getChangedApps } from './get-changed-apps';

vi.mock('@actions/exec');

describe('getChangedApps', () => {
  const mockGetExecOutput = vi.mocked(exec.getExecOutput);

  const mockExec = (diff: string, affected: string[] = []) => {
    mockGetExecOutput.mockImplementation(async (command, args) => ({
      exitCode: 0,
      stdout: command === 'git' ? diff : JSON.stringify(affected),
      stderr: ''
    }));
    return args;
  };
  const args = { base: 'aaa', head: 'bbb', apps: ['web', 'cms'] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('diffs the range', async () => {
    mockExec('');

    await getChangedApps(args);

    expect(mockGetExecOutput).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.quotepath=off', 'diff', '--name-only', 'aaa', 'bbb'],
      expect.anything()
    );
  });

  it('does not call Nx when no files change', async () => {
    mockExec('');

    expect(await getChangedApps(args)).toEqual([]);
    expect(mockGetExecOutput).toHaveBeenCalledTimes(1);
  });

  it('does not call Nx when only ignored files change', async () => {
    mockExec('apps/cms/CLAUDE.md\nlibs/a/src/b.spec.ts\n.claude/x/SKILL.md\n');

    expect(await getChangedApps(args)).toEqual([]);
    expect(mockGetExecOutput).toHaveBeenCalledTimes(1);
  });

  it('asks Nx about the files that are left', async () => {
    mockExec('apps/cms/CLAUDE.md\napps/web/src/a.ts\npnpm-lock.yaml\n', [
      'web'
    ]);

    await getChangedApps(args);

    expect(mockGetExecOutput).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.arrayContaining([
        'show',
        'projects',
        '--affected',
        '--files',
        'apps/web/src/a.ts,pnpm-lock.yaml',
        '--json'
      ]),
      expect.anything()
    );
  });

  it('intersects the affected projects with the apps', async () => {
    mockExec('libs/a/src/x.ts\n', ['a', 'web', 'e2e']);

    expect(await getChangedApps(args)).toEqual(['web']);
  });

  describe('a long diff', () => {
    const files = (n: number) =>
      Array.from({ length: n }, (_, i) => `libs/a/src/f${i}.ts`).join('\n');
    const nxCalls = () =>
      mockGetExecOutput.mock.calls.filter(([command]) => command !== 'git');

    it('asks Nx in chunks that keep each argument short', async () => {
      mockExec(files(1200), []);

      await getChangedApps(args);

      expect(nxCalls()).toHaveLength(3);
      for (const [, argv] of nxCalls()) {
        const list = argv?.[(argv?.indexOf('--files') ?? 0) + 1] ?? '';
        expect(list.split(',').length).toBeLessThanOrEqual(500);
      }
    });

    it('merges the chunks', async () => {
      let call = 0;
      mockGetExecOutput.mockImplementation(async (command) => ({
        exitCode: 0,
        stdout:
          command === 'git'
            ? files(1200)
            : JSON.stringify(++call === 2 ? ['cms'] : []),
        stderr: ''
      }));

      expect(await getChangedApps(args)).toEqual(['cms']);
    });

    it('stops once every app is affected', async () => {
      mockExec(files(1200), ['web', 'cms']);

      expect(await getChangedApps(args)).toEqual(['web', 'cms']);
      expect(nxCalls()).toHaveLength(1);
    });
  });
});
