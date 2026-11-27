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
  it('says why --tenant has nothing to choose when production holds no tenant', async () => {
    const { readTenantDeployments } = await import('../../services/infisical');
    vi.mocked(readTenantDeployments).mockResolvedValueOnce(new Map());
    const command = (await import('./gate')).default;
    const stdout: string[] = [];

    const exit = await runCommand({
      name: 'tenant gate',
      command,
      argv: [
        'open',
        '--env',
        'production',
        '--tenant',
        'acme',
        '--yes',
        '--json'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).not.toBe(EXIT.ok);
    expect(stdout.join('\n')).toContain(
      'No tenant under /tenants in production'
    );
  });

  it('closes a tenant on production, revealing the password once', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { setSecretsTogether } = await import('../../services/fly');
    const command = (await import('./gate')).default;

    const ui = fakeUi(['acme', true, true]);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'tenant gate',
      command,
      argv: ['close', '--env', 'production', '--interactive'],
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

  it('describes a dry run as JSON without the password', async () => {
    const command = (await import('./gate')).default;

    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'tenant gate',
      command,
      argv: [
        'close',
        '--env',
        'production',
        '--tenant',
        'acme',
        '--password',
        'hunter2-hunter2',
        '--dry-run',
        '--json'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    const out = JSON.parse(stdout[0] ?? '');
    expect(out.plan.json).toEqual({
      tenant: 'acme',
      environment: 'production',
      apps: [
        {
          app: 'cms',
          flyApp: 'cdwr-cms-acme',
          inInfisical: false,
          onFly: 'missing'
        }
      ]
    });
    expect(stdout.join('')).not.toContain('hunter2');
  });

  it('keeps the Fly error of an app it could not read', async () => {
    const { fly } = await import('../../services/fly');
    vi.mocked(fly).mockReturnValueOnce({
      secrets: {
        list: vi
          .fn()
          .mockRejectedValue(
            new Error('[list secrets] something broke\nError: unauthorized')
          )
      }
    } as unknown as ReturnType<typeof fly>);
    const command = (await import('./gate')).default;

    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'tenant gate',
      command,
      argv: [
        'open',
        '--env',
        'production',
        '--tenant',
        'acme',
        '--dry-run',
        '--json'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    const out = JSON.parse(stdout[0] ?? '');
    expect(out.plan.json.apps).toEqual([
      {
        app: 'cms',
        flyApp: 'cdwr-cms-acme',
        inInfisical: false,
        onFly: 'unreachable',
        flyError: 'Error: unauthorized'
      }
    ]);
  });

  describe('with one app Fly could not read beside a live one', () => {
    afterEach(async () => {
      const { readTenantDeployments } =
        await import('../../services/infisical');
      vi.mocked(readTenantDeployments).mockResolvedValue(
        new Map([['acme', [{ app: 'cms', secrets: {} }]]])
      );
    });

    /** cms fails its Fly read; headless reads and carries the password */
    async function arrange() {
      const { readTenantDeployments } =
        await import('../../services/infisical');
      const { fly, flyAppName } = await import('../../services/fly');
      // Read twice: once for the tenant choices, once by the plan
      vi.mocked(readTenantDeployments).mockResolvedValue(
        new Map([
          [
            'acme',
            [
              { app: 'cms', secrets: {} },
              { app: 'headless', secrets: {} }
            ]
          ]
        ]) as Awaited<ReturnType<typeof readTenantDeployments>>
      );
      vi.mocked(flyAppName)
        .mockReturnValueOnce('cdwr-cms-acme')
        .mockReturnValueOnce('cdwr-headless-acme');
      const unset = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fly)
        .mockReturnValueOnce({
          secrets: {
            list: vi.fn().mockRejectedValue(new Error('Error: unauthorized'))
          }
        } as unknown as ReturnType<typeof fly>)
        .mockReturnValueOnce({
          secrets: { list: vi.fn().mockResolvedValue([{ name: GATE_KEY }]) }
        } as unknown as ReturnType<typeof fly>)
        .mockReturnValueOnce({
          secrets: { unset }
        } as unknown as ReturnType<typeof fly>);
      return { unset };
    }

    async function run(argv: string[]) {
      const command = (await import('./gate')).default;
      const stdout: string[] = [];
      const exit = await runCommand({
        name: 'tenant gate',
        command,
        argv: [
          ...argv,
          '--env',
          'production',
          '--tenant',
          'acme',
          '--yes',
          '--json'
        ],
        root: '/repo',
        env: {},
        prefs: memoryPrefs(),
        interactive: false,
        ui: fakeUi([], false),
        history: () => undefined,
        stdout: (t) => stdout.push(t)
      });
      return { exit, out: JSON.parse(stdout[0] ?? '') };
    }

    it('opens the live app and reports the other as partial', async () => {
      const { unset } = await arrange();
      const { deleteInfisicalSecret } =
        await import('../../services/infisical');
      vi.mocked(deleteInfisicalSecret).mockClear();

      const { exit, out } = await run(['open']);

      expect(exit).toBe(EXIT.failed);
      expect(deleteInfisicalSecret).toHaveBeenCalledTimes(2);
      expect(unset).toHaveBeenCalledWith(GATE_KEY, {
        app: 'cdwr-headless-acme'
      });
      expect(out.result.reason).toBe(
        'cdwr-cms-acme not read on Fly: Error: unauthorized'
      );
      expect(out.result.unread).toEqual([
        { flyApp: 'cdwr-cms-acme', flyError: 'Error: unauthorized' }
      ]);
    });

    it('closes the live app and reports the other as partial', async () => {
      await arrange();
      const { setSecretsTogether } = await import('../../services/fly');
      vi.mocked(setSecretsTogether).mockClear();

      const { exit, out } = await run([
        'close',
        '--password',
        'hunter2-hunter2'
      ]);

      expect(exit).toBe(EXIT.failed);
      expect(setSecretsTogether).toHaveBeenCalledWith(
        ['cdwr-headless-acme'],
        { [GATE_KEY]: 'hunter2-hunter2' },
        expect.any(Function)
      );
      expect(out.result.reason).toBe(
        'cdwr-cms-acme not read on Fly: Error: unauthorized'
      );
      expect(out.result.reason).not.toContain('hunter2');
    });
  });
});
