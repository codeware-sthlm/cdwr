import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command from './tenants';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/infisical', () => ({
  readTenantDeployments: vi.fn().mockResolvedValue(
    new Map([
      [
        'acme',
        [
          { app: 'web', secrets: {} },
          { app: 'cms', secrets: {} }
        ]
      ],
      ['_default', [{ app: 'cms', secrets: {} }]]
    ])
  )
}));

describe('infisical tenants', () => {
  it('reports each app and its tenants without confirming', async () => {
    const ui = fakeUi([]);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'infisical tenants',
      command,
      argv: ['--env', 'preview', '--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(ui.asked).toEqual([]);
    expect(JSON.parse(stdout[0] ?? '').result).toEqual({
      cms: ['_default', 'acme'],
      web: ['acme']
    });
  });
});
