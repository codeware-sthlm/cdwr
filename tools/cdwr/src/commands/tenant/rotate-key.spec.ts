import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://fake'),
  withDatabase: vi.fn((url: string, fn: (url: string) => unknown) => fn(url)),
  runCmsScript: vi.fn(async () => ({
    stdout: 'RESOLVED_TENANT=acme-slug\nROTATED_API_KEY=new-key\n',
    stderr: ''
  })),
  redactReported: (output: string) => output,
  reported: (stdout: string, key: string) =>
    stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]
}));

vi.mock('../../services/fly', () => ({
  flyAppName: vi.fn(() => 'cdwr-cms-acme'),
  pullRequestOf: vi.fn(() => undefined),
  setSecretsTogether: vi.fn(async () => undefined),
  startMachines: vi.fn(async () => undefined),
  listPreviewCmsApps: vi.fn(async () => [])
}));

vi.mock('../../services/infisical', () => ({
  readTenantDeployments: vi.fn(
    async () =>
      new Map([
        ['acme', [{ app: 'cms', secrets: { PAYLOAD_API_KEY: 'old-key' } }]]
      ])
  ),
  assertWritable: vi.fn(async () => undefined),
  setInfisicalSecret: vi.fn().mockResolvedValue({
    action: 'updated',
    key: 'PAYLOAD_API_KEY',
    path: '/x'
  })
}));

describe('tenant rotate-key', () => {
  it('rotates the key in Payload, Infisical and Fly', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { setSecretsTogether } = await import('../../services/fly');
    const command = (await import('./rotate-key')).default;

    const ui = fakeUi([]);
    const exit = await runCommand({
      name: 'tenant rotate-key',
      command,
      argv: ['--env', 'production', '--tenant', 'acme', '--yes'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(ui.asked).toEqual([]);
    expect(setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/tenants/acme/apps/cms',
      key: 'PAYLOAD_API_KEY',
      value: 'new-key'
    });
    expect(setSecretsTogether).toHaveBeenCalledWith(
      ['cdwr-cms-acme'],
      { PAYLOAD_API_KEY: 'new-key' },
      expect.any(Function)
    );
    expect(ui.printed.outro[0]).toContain(
      "Rotated API key for 'acme' (tenant 'acme-slug') in production"
    );
  });

  it('refuses when the tenant apps disagree on the current key', async () => {
    const { readTenantDeployments } = await import('../../services/infisical');
    vi.mocked(readTenantDeployments).mockResolvedValue(
      new Map([
        [
          'acme',
          [
            { app: 'cms', secrets: { PAYLOAD_API_KEY: 'key-1' } },
            { app: 'web', secrets: { PAYLOAD_API_KEY: 'key-2' } }
          ]
        ]
      ])
    );
    const command = (await import('./rotate-key')).default;

    const exit = await runCommand({
      name: 'tenant rotate-key',
      command,
      argv: ['--env', 'production', '--tenant', 'acme', '--yes'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.failed);
  });
});
