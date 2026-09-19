import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import { GATE_KEY } from './gate.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/fly', () => ({
  fly: vi.fn(() => ({
    secrets: {
      list: vi.fn().mockResolvedValue([]),
      unset: vi.fn().mockResolvedValue(undefined)
    }
  })),
  flyAppName: vi.fn(() => 'cdwr-cms-acme'),
  listPreviewCmsApps: vi.fn().mockResolvedValue([]),
  setSecretsTogether: vi.fn().mockResolvedValue(undefined),
  startMachines: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/infisical', () => ({
  readTenantDeployments: vi
    .fn()
    .mockResolvedValue(new Map([['acme', [{ app: 'cms', secrets: {} }]]])),
  deleteInfisicalSecret: vi.fn().mockResolvedValue(true),
  setInfisicalSecret: vi
    .fn()
    .mockResolvedValue({ action: 'created', key: GATE_KEY, path: '/x' })
}));

describe('tenant gate', () => {
  it('closes a tenant on production, revealing the password once', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { setSecretsTogether } = await import('../../services/fly');
    const command = (await import('./gate')).default;

    const ui = fakeUi(['acme', true, true]);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'tenant gate',
      command,
      argv: ['close', '--env', 'production'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui,
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(setInfisicalSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        path: '/tenants/acme/apps/cms',
        key: GATE_KEY
      })
    );
    expect(setSecretsTogether).toHaveBeenCalledWith(
      ['cdwr-cms-acme'],
      expect.objectContaining({ [GATE_KEY]: expect.any(String) }),
      expect.any(Function)
    );
    expect(ui.printed.note.some((n) => n.startsWith('Share this'))).toBe(true);
    expect(ui.printed.outro[0]).toContain('acme is closed in production');
  });
});
