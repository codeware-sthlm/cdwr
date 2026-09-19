import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/infisical', () => ({
  readFolders: vi.fn().mockResolvedValue([
    {
      path: '/tenants/acme/apps/cms',
      secrets: [
        { secretKey: 'PUBLIC_URL', secretValue: 'https://acme.example.com' }
      ]
    }
  ]),
  maskValues: (secrets: Record<string, string>) =>
    Object.fromEntries(Object.entries(secrets).map(([k]) => [k, '••••']))
}));

describe('infisical data', () => {
  it('masks values by default and reveals them with --reveal', async () => {
    const { readFolders } = await import('../../services/infisical');
    const command = (await import('./data')).default;

    const masked = await runCommand({
      name: 'infisical data',
      command,
      argv: ['--env', 'production'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });
    expect(masked).toBe(EXIT.ok);
    expect(readFolders).toHaveBeenCalledWith('production', '/tenants');

    const stdout: string[] = [];
    const revealed = await runCommand({
      name: 'infisical data',
      command,
      argv: ['--env', 'production', '--reveal', '--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });
    expect(revealed).toBe(EXIT.ok);
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: Array<{ secrets: Record<string, string> }>;
    };
    expect(payload.result[0]?.secrets['PUBLIC_URL']).toBe(
      'https://acme.example.com'
    );
  });
});
