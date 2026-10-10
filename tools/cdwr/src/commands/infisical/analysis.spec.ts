import { fetchDeployments } from '@codeware/shared/feature/tenancy';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command from './analysis';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('@codeware/shared/feature/tenancy', () => ({
  fetchDeployments: vi.fn().mockResolvedValue({
    deployments: { cms: [{}, { tenant: 'acme' }], web: [], builder: [] },
    skipped: [{ app: 'web', tenant: 'acme', reason: 'flag-off' }]
  })
}));

vi.mock('../../services/infisical', () => ({
  readSecrets: vi.fn().mockResolvedValue({ DATABASE_URL: 'postgres://secret' }),
  maskValues: () => ({ DATABASE_URL: '••••' })
}));

describe('infisical analysis', () => {
  it('analyzes preview and production without prompting', async () => {
    const ui = fakeUi([]);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'infisical analysis',
      command,
      argv: [],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui,
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(fetchDeployments).toHaveBeenCalledTimes(2);
    expect(ui.asked).toEqual([]);
    expect(ui.printed.outro[0]).toContain('Analyzed 2 environment(s)');
  });

  it('masks secret values unless --reveal is given', async () => {
    const stdout: string[] = [];
    await runCommand({
      name: 'infisical analysis',
      command,
      argv: ['--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: Array<{
        apps: Array<{
          app: string;
          host: string;
          tenants: Array<{ tenant: string; flag: string }>;
          secrets: Record<string, string>;
        }>;
      }>;
    };
    expect(payload.result[0]?.apps[0]?.secrets['DATABASE_URL']).toBe('••••');
    expect(payload.result[0]?.apps.map(({ app }) => app)).toEqual([
      'cms',
      'web',
      'builder'
    ]);
    expect(payload.result[0]?.apps[0]).toMatchObject({
      host: 'on',
      tenants: [{ tenant: 'acme', flag: 'on' }]
    });
    expect(payload.result[0]?.apps[1]).toMatchObject({
      host: 'no flag',
      tenants: [{ tenant: 'acme', flag: 'off' }]
    });
  });

  const run = (stdout: string[]) =>
    runCommand({
      name: 'infisical analysis',
      command,
      argv: ['--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

  it('shows an app without a folder as having no secrets', async () => {
    const { readSecrets } = await import('../../services/infisical');
    vi.mocked(readSecrets).mockImplementation(async (_env, path) => {
      if (path === '/apps/builder') {
        throw Object.assign(new Error('missing'), {
          response: { status: 404 }
        });
      }
      return { DATABASE_URL: 'postgres://secret' };
    });
    const stdout: string[] = [];

    const exit = await run(stdout);

    expect(exit).toBe(EXIT.ok);
    const payload = JSON.parse(stdout[0] ?? '{}') as {
      result: Array<{ apps: Array<{ app: string; host: string }> }>;
    };
    expect(payload.result[0]?.apps[2]).toMatchObject({
      app: 'builder',
      host: 'no flag'
    });
  });

  it('fails on a read error that is not a missing folder', async () => {
    const { readSecrets } = await import('../../services/infisical');
    vi.mocked(readSecrets).mockRejectedValue(
      Object.assign(new Error('denied'), { response: { status: 403 } })
    );

    const exit = await run([]);

    expect(exit).not.toBe(EXIT.ok);
  });
});
