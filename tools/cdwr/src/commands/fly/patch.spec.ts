import { readFileSync, writeFileSync } from 'node:fs';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const configSave = vi.fn();
const status = vi.fn();
const deploy = vi.fn();
const listAppNames = vi.fn();

vi.mock('../../services/fly', () => ({
  fly: () => ({ config: { save: configSave }, status, deploy }),
  listAppNames: (...a: unknown[]) => listAppNames(...a),
  pullRequestOf: (name: string) => {
    const match = name.match(/-pr-(\d+)/);
    return match ? Number(match[1]) : undefined;
  }
}));

const runPatch = (argv: string[]) =>
  import('./patch').then(({ default: command }) =>
    runCommand({
      name: 'fly patch',
      command,
      argv,
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    })
  );

describe('fly patch', () => {
  beforeEach(() => {
    configSave.mockReset();
    status.mockReset();
    deploy.mockReset();
    listAppNames.mockReset();
    listAppNames.mockResolvedValue(['cdwr-cms']);
    status.mockResolvedValue({
      machines: [
        {
          imageRef: {
            registry: 'registry.fly.io',
            repository: 'cdwr-cms',
            tag: 'deployment-1'
          }
        }
      ]
    });
    deploy.mockResolvedValue({
      app: 'cdwr-cms',
      hostname: 'x',
      url: 'https://x'
    });
  });

  it('merges a known patch and deploys with the current image', async () => {
    configSave.mockImplementation(
      async ({ config }: { app: string; config: string }) => {
        writeFileSync(
          config,
          "app = 'cdwr-cms'\n\n[http_service]\nmin_machines_running = 0\n",
          'utf8'
        );
      }
    );
    // The deploy temp file is removed again right after this call, so read
    // it from inside the mock rather than after the run completes.
    let deployedConfig = '';
    deploy.mockImplementation(
      async ({ config }: { app: string; config: string }) => {
        deployedConfig = readFileSync(config, 'utf8');
        return { app: 'cdwr-cms', hostname: 'x', url: 'https://x' };
      }
    );

    const exit = await runPatch([
      '--patch',
      'always-on-small',
      '--apps',
      'cdwr-cms',
      '--yes'
    ]);

    expect(exit).toBe(EXIT.ok);
    expect(deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'cdwr-cms',
        image: 'registry.fly.io/cdwr-cms:deployment-1'
      })
    );
    expect(deployedConfig).toContain('min_machines_running = 1');
  });

  it('ends without deploying when the patch changes nothing', async () => {
    configSave.mockImplementation(
      async ({ config }: { app: string; config: string }) => {
        writeFileSync(
          config,
          "[http_service]\nauto_stop_machines = 'off'\nauto_start_machines = true\nmin_machines_running = 1\n\n[[vm]]\nsize = 'shared-cpu-1x'\nmemory = '512mb'\n",
          'utf8'
        );
      }
    );

    const exit = await runPatch([
      '--patch',
      'always-on-small',
      '--apps',
      'cdwr-cms',
      '--yes'
    ]);

    expect(exit).toBe(EXIT.ok);
    expect(deploy).not.toHaveBeenCalled();
  });

  it('reports a partial result when a deploy fails', async () => {
    configSave.mockImplementation(
      async ({ config }: { app: string; config: string }) => {
        writeFileSync(config, "app = 'cdwr-cms'\n", 'utf8');
      }
    );
    deploy.mockRejectedValue(new Error('build failed'));

    const exit = await runPatch([
      '--patch',
      'always-on-small',
      '--apps',
      'cdwr-cms',
      '--yes'
    ]);

    expect(exit).toBe(EXIT.failed);
  });
});
