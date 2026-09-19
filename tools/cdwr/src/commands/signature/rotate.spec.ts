import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/fly', () => ({
  configAppName: vi.fn((_root: string, app: string) => `cdwr-${app}`),
  listAppNames: vi.fn().mockResolvedValue(['cdwr-cms', 'cdwr-web-production']),
  restartMachines: vi.fn().mockResolvedValue(1),
  belongsTo: (name: string, environment: 'preview' | 'production') =>
    (environment === 'preview') === /-pr-(\d+)(?:-|$)/.test(name)
}));

vi.mock('../../services/infisical', () => ({
  readSecrets: vi.fn().mockResolvedValue({ SIGNATURE_SECRET: 'abc' }),
  assertWritable: vi.fn().mockResolvedValue(undefined),
  setInfisicalSecret: vi
    .fn()
    .mockResolvedValue({ action: 'updated', key: 'x', path: '/x' }),
  deleteInfisicalSecret: vi.fn().mockResolvedValue(true)
}));

describe('signature rotate', () => {
  it('rolls through every step in one run on a fresh secret', async () => {
    const fly = await import('../../services/fly');
    const infisical = await import('../../services/infisical');
    const command = (await import('./rotate')).default;

    const ui = fakeUi(['signature']);
    const exit = await runCommand({
      name: 'signature rotate',
      command,
      argv: ['--env', 'production'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).toHaveBeenCalledTimes(2);
    expect(infisical.setInfisicalSecret).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        key: 'SIGNATURE_SECRET_PREVIOUS',
        value: 'abc'
      })
    );
    expect(infisical.deleteInfisicalSecret).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'SIGNATURE_SECRET_PREVIOUS' })
    );
    // Verifier (cms) restarts for every step, signer (web) only once
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-cms');
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-web-production');
    expect(ui.asked[0]).toContain('Type');
  });
});
