import * as lib from '@codeware/shared/util/infisical-cli';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('@codeware/shared/util/infisical-cli', () => ({
  deployEnvironment: () => 'development',
  discoverPaths: vi.fn().mockReturnValue(['/apps/cms', '/apps/cms/signature']),
  fetchVault: vi.fn().mockReturnValue({
    values: { A: 'one', B: 'two' },
    paths: ['/apps/cms', '/apps/cms/signature']
  }),
  offlineCacheFile: (root: string) => `${root}/apps/cms/.env.offline`,
  writeOfflineCache: vi.fn()
}));

const run = async (argv: string[]) => {
  const stdout: string[] = [];
  const command = (await import('./cache')).default;
  const code = await runCommand({
    name: 'infisical cache',
    command,
    argv,
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([], false),
    history: () => undefined,
    stdout: (t) => stdout.push(t)
  });
  return { code, stdout };
};

describe('infisical cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists folders on a dry run but fetches and writes nothing', async () => {
    const { code } = await run(['--path', '/apps/cms', '--dry-run']);
    expect(code).toBe(EXIT.ok);
    expect(lib.discoverPaths).toHaveBeenCalled();
    expect(lib.fetchVault).not.toHaveBeenCalled();
    expect(lib.writeOfflineCache).not.toHaveBeenCalled();
  });

  it('writes the cache and reports counts without values', async () => {
    const { code, stdout } = await run([
      '--path',
      '/apps/cms',
      '--yes',
      '--json'
    ]);
    expect(code).toBe(EXIT.ok);
    expect(lib.writeOfflineCache).toHaveBeenCalledWith(
      '/repo/apps/cms/.env.offline',
      {
        environment: 'development',
        paths: ['/apps/cms', '/apps/cms/signature'],
        values: { A: 'one', B: 'two' }
      }
    );
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: { values: number; paths: number; file: string };
    };
    expect(payload.result).toEqual({
      environment: 'development',
      file: 'apps/cms/.env.offline',
      values: 2,
      paths: 2
    });
    expect(lib.fetchVault).toHaveBeenCalledWith(
      '/apps/cms',
      'development',
      undefined,
      ['/apps/cms', '/apps/cms/signature']
    );
    expect(stdout[0]).not.toContain('one');
  });
});
