import * as lib from '@codeware/shared/util/infisical-cli';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('@codeware/shared/util/infisical-cli', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@codeware/shared/util/infisical-cli')
  >()),
  fetchVault: vi.fn().mockReturnValue({
    values: {
      DATABASE_URL: 'postgres://vault-secret-value',
      LOG_LEVEL: 'debug'
    },
    paths: ['/apps/cms']
  }),
  readOfflineCache: vi.fn().mockReturnValue({ LOG_LEVEL: 'cached-value' }),
  offlineCacheFile: (root: string) => `${root}/apps/cms/.env.offline`,
  taskEnvFiles: vi.fn().mockReturnValue({
    all: ['/repo/apps/cms/.env'],
    committed: ['/repo/apps/cms/.env'],
    local: []
  }),
  readEnvFiles: vi.fn().mockReturnValue({ LOG_LEVEL: 'info' }),
  readCommittedEnv: vi.fn().mockReturnValue({ LOG_LEVEL: 'info' })
}));

const run = async (env: NodeJS.ProcessEnv) => {
  const stdout: string[] = [];
  const command = (await import('./resolve')).default;
  const code = await runCommand({
    name: 'infisical resolve',
    command,
    argv: ['--path', '/apps/cms', '--json'],
    root: '/repo',
    env,
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([], false),
    history: () => undefined,
    stdout: (t) => stdout.push(t)
  });
  return { code, stdout };
};

describe('infisical resolve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports sources from the vault and never a value in the clear', async () => {
    const { code, stdout } = await run({ DATABASE_URL: 'postgres://mine-abc' });
    expect(code).toBe(EXIT.ok);
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: Array<{ key: string; source: string }>;
    };
    expect(payload.result.map(({ key, source }) => [key, source])).toEqual([
      ['DATABASE_URL', 'inherited'],
      ['LOG_LEVEL', 'vault over committed']
    ]);
    expect(stdout[0]).not.toContain('vault-secret-value');
    expect(stdout[0]).not.toContain('mine-abc');
  });

  it('treats a local override file as inherited', async () => {
    vi.mocked(lib.readEnvFiles).mockReturnValueOnce({
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgres://from-local-file'
    });
    const { stdout } = await run({});
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: Array<{ key: string; source: string }>;
    };
    expect(payload.result.map(({ key, source }) => [key, source])).toEqual([
      ['DATABASE_URL', 'inherited'],
      ['LOG_LEVEL', 'vault over committed']
    ]);
    expect(stdout[0]).not.toContain('from-local-file');
  });

  it('reads the offline cache when OFFLINE is set', async () => {
    const { code } = await run({ OFFLINE: '1' });
    expect(code).toBe(EXIT.ok);
    expect(lib.readOfflineCache).toHaveBeenCalled();
    expect(lib.fetchVault).not.toHaveBeenCalled();
  });

  it('skips the vault in CI', async () => {
    const { code } = await run({ CI: 'true' });
    expect(code).toBe(EXIT.ok);
    expect(lib.fetchVault).not.toHaveBeenCalled();
  });
});
