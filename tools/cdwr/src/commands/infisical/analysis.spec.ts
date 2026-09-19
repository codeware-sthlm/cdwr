import { fetchDeployRules } from '@codeware/shared/feature/tenancy';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command from './analysis';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('@codeware/shared/feature/tenancy', () => ({
  fetchDeployRules: vi.fn().mockResolvedValue({ apps: '*', tenants: '*' }),
  fetchAppTenants: vi.fn().mockResolvedValue({
    cms: [{ tenant: 'acme' }],
    web: [{ tenant: 'acme' }]
  }),
  filterByDeployRules: vi.fn((appTenants) => appTenants)
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
    expect(fetchDeployRules).toHaveBeenCalledTimes(2);
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
      result: Array<{ apps: Array<{ secrets: Record<string, string> }> }>;
    };
    expect(payload.result[0]?.apps[0]?.secrets['DATABASE_URL']).toBe('••••');
  });
});
