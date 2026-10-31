import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const { setFlySecrets } = vi.hoisted(() => ({
  setFlySecrets: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/fly', () => ({
  configAppName: vi.fn((_root: string, app: string) => `cdwr-${app}`),
  fly: () => ({ secrets: { set: setFlySecrets } }),
  startMachines: vi.fn().mockResolvedValue(undefined),
  listAppNames: vi
    .fn()
    .mockResolvedValue([
      'cdwr-cms',
      'cdwr-headless-acme',
      'cdwr-web-production'
    ]),
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
      argv: ['--env', 'production', '--interactive'],
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
    // Verifier (cms) restarts for every step, web once; headless gets the
    // new secret itself, the one written to Infisical
    const generated = vi.mocked(infisical.setInfisicalSecret).mock.calls[1][0];
    expect(generated).toMatchObject({ key: 'SIGNATURE_SECRET' });
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-cms');
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-web-production');
    expect(fly.restartMachines).not.toHaveBeenCalledWith('cdwr-headless-acme');
    expect(setFlySecrets).toHaveBeenCalledTimes(1);
    expect(setFlySecrets).toHaveBeenCalledWith(
      { SIGNATURE_SECRET: generated.value },
      { app: 'cdwr-headless-acme' }
    );
    expect(ui.asked[0]).toContain('Type');
  });

  it('resumes a rollover by setting the active secret on headless before retiring', async () => {
    const fly = await import('../../services/fly');
    const infisical = await import('../../services/infisical');
    vi.mocked(infisical.readSecrets).mockResolvedValueOnce({
      SIGNATURE_SECRET: 'new',
      SIGNATURE_SECRET_PREVIOUS: 'abc'
    });
    vi.mocked(infisical.setInfisicalSecret).mockClear();
    vi.mocked(infisical.deleteInfisicalSecret).mockClear();
    vi.mocked(fly.restartMachines).mockClear();
    setFlySecrets.mockClear();
    const command = (await import('./rotate')).default;

    const exit = await runCommand({
      name: 'signature rotate',
      command,
      argv: ['--env', 'production', '--interactive'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi(['signature'])
    });

    expect(exit).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(setFlySecrets).toHaveBeenCalledWith(
      { SIGNATURE_SECRET: 'new' },
      { app: 'cdwr-headless-acme' }
    );
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-web-production');
    // cms knows the new secret before headless signs with it
    expect(vi.mocked(fly.restartMachines).mock.calls[0]).toEqual(['cdwr-cms']);
    expect(
      vi.mocked(fly.restartMachines).mock.invocationCallOrder[0]
    ).toBeLessThan(setFlySecrets.mock.invocationCallOrder[0]);
    expect(setFlySecrets.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(infisical.deleteInfisicalSecret).mock.invocationCallOrder[0]
    );
  });

  it('rolls over with no signer left, restarting only cms', async () => {
    const fly = await import('../../services/fly');
    vi.mocked(fly.listAppNames).mockResolvedValueOnce(['cdwr-cms']);
    vi.mocked(fly.restartMachines).mockClear();
    setFlySecrets.mockClear();
    const command = (await import('./rotate')).default;

    const exit = await runCommand({
      name: 'signature rotate',
      command,
      argv: ['--env', 'production', '--interactive'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi(['signature'])
    });

    expect(exit).toBe(EXIT.ok);
    expect(fly.restartMachines).not.toHaveBeenCalledWith(
      expect.stringMatching(/^cdwr-(web|headless)/)
    );
    expect(fly.restartMachines).toHaveBeenCalledWith('cdwr-cms');
    expect(setFlySecrets).not.toHaveBeenCalled();
  });
});
