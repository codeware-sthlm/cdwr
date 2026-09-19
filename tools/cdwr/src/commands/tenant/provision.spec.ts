import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const { fakeClient, createFolder } = vi.hoisted(() => {
  const listFolders = vi.fn(async () => []);
  const createFolder = vi.fn(async () => undefined);
  const listSecretsWithImports = vi.fn(
    async ({ secretPath }: { secretPath: string }) =>
      secretPath === '/'
        ? [
            {
              secretKey: 'DEPLOY_RULES',
              secretValue: '{}',
              secretMetadata: [
                { key: 'apps', value: '*' },
                { key: 'tenants', value: '*' }
              ]
            }
          ]
        : []
  );
  const fakeClient = {
    folders: () => ({ listFolders, create: createFolder }),
    secrets: () => ({ listSecretsWithImports })
  };
  return { fakeClient, listFolders, createFolder, listSecretsWithImports };
});

vi.mock('@codeware/shared/feature/infisical', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createClient: vi.fn(async () => ({ client: fakeClient, projectId: 'proj' })),
  isNotFound: vi.fn(() => false)
}));

vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://fake'),
  withDatabase: vi.fn((url: string, fn: (url: string) => unknown) => fn(url)),
  runCmsScript: vi.fn(async () => ({
    stdout: `TENANT_DEPLOYMENTS=${JSON.stringify([
      {
        id: 1,
        name: 'Acme',
        slug: 'acme',
        deployment: 'acme',
        apiKey: 'the-key'
      }
    ])}\n`,
    stderr: ''
  })),
  reported: (stdout: string, key: string) =>
    stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1],
  redactReported: (output: string) => output
}));

vi.mock('../../services/fly', () => ({
  flyAppName: vi.fn(() => 'cdwr-cms-acme'),
  listAppNames: vi.fn(async () => []),
  pullRequestOf: vi.fn(() => undefined),
  listPreviewCmsApps: vi.fn(async () => [])
}));

vi.mock('../../services/github', () => ({
  listWorkflowRuns: vi.fn(async () => []),
  pullRequestBranch: vi.fn(async () => undefined),
  runWorkflow: vi.fn(async () => ['workflow', 'run', 'fly-deployment.yml']),
  currentPullRequest: vi.fn(async () => undefined)
}));

vi.mock('../../services/infisical', () => ({
  readSecrets: vi.fn(async () => ({})),
  setInfisicalSecret: vi.fn().mockResolvedValue({
    action: 'created',
    key: 'PAYLOAD_API_KEY',
    path: '/x'
  })
}));

describe('tenant provision', () => {
  it('creates the folders and key, then triggers the deployment', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { runWorkflow } = await import('../../services/github');
    const command = (await import('./provision')).default;

    const ui = fakeUi([]);
    const exit = await runCommand({
      name: 'tenant provision',
      command,
      argv: [
        '--env',
        'production',
        '--workspace',
        'acme',
        '--apps',
        'cms',
        '--yes'
      ],
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
    expect(createFolder).toHaveBeenCalledTimes(4);
    expect(setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/tenants/acme/apps/cms',
      key: 'PAYLOAD_API_KEY',
      value: 'the-key'
    });
    expect(runWorkflow).toHaveBeenCalledWith(
      '/repo',
      'fly-deployment.yml',
      'main',
      { app: 'cms', tenant: 'acme', environment: 'production' }
    );
    expect(ui.printed.outro[0]).toContain("Provisioned 'acme' in production");
  });
});
