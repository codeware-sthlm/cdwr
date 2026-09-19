import { fetchAppTenants } from '@codeware/shared/feature/tenancy';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command from './tenants';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('@codeware/shared/feature/tenancy', () => ({
  fetchAppTenants: vi.fn().mockResolvedValue({
    web: [{ tenant: 'acme' }],
    cms: []
  })
}));

describe('infisical tenants', () => {
  it('reports each app and its tenants without confirming', async () => {
    const ui = fakeUi([]);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'infisical tenants',
      command,
      argv: ['--env', 'preview'],
      root: '/repo',
      env: { INFISICAL_CLIENT_ID: 'id' },
      prefs: memoryPrefs(),
      interactive: true,
      ui,
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(ui.asked).toEqual([]);
    expect(fetchAppTenants).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'preview', site: 'eu' }),
      ['web', 'cms']
    );
    expect(ui.printed.outro[0]).toContain('2 app(s) checked');
  });
});
