import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const { fakeClient, createFolder, listFolders } = vi.hoisted(() => {
  const listFolders = vi.fn(
    async (_args: { path: string }): Promise<Array<{ name: string }>> => []
  );
  const createFolder = vi.fn(async () => undefined);
  const fakeClient = {
    folders: () => ({ listFolders, create: createFolder })
  };
  return { fakeClient, listFolders, createFolder };
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
  readDeployFlag: vi.fn(async (): Promise<string | undefined> => undefined),
  setInfisicalSecret: vi.fn().mockResolvedValue({
    action: 'created',
    key: 'PAYLOAD_API_KEY',
    path: '/x'
  })
}));

const run = async (extra: string[] = []) => {
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
      '--yes',
      ...extra
    ],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: true,
    ui,
    history: () => undefined,
    stdout: () => undefined
  });
  return { exit, ui };
};

const EXISTING_FOLDERS: Record<string, Array<{ name: string }>> = {
  '/': [{ name: 'tenants' }],
  '/tenants': [{ name: 'acme' }],
  '/tenants/acme': [{ name: 'apps' }],
  '/tenants/acme/apps': [{ name: 'cms' }]
};

/** The tenant folder exists and holds the key, plus the given flag if any */
const existingFolder = async (flag?: string) => {
  const { readSecrets, readDeployFlag } =
    await import('../../services/infisical');
  vi.mocked(readSecrets).mockResolvedValue({
    PAYLOAD_API_KEY: 'the-key',
    ...(flag === undefined ? {} : { DEPLOY_ENABLED: flag })
  });
  vi.mocked(readDeployFlag).mockResolvedValue(flag);
  listFolders.mockImplementation(
    async ({ path }: { path: string }) => EXISTING_FOLDERS[path] ?? []
  );
};

describe('tenant provision', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { readSecrets, readDeployFlag } =
      await import('../../services/infisical');
    vi.mocked(readSecrets).mockResolvedValue({});
    vi.mocked(readDeployFlag).mockResolvedValue(undefined);
    listFolders.mockImplementation(async () => []);
  });

  it('creates the folders, key and flag, then triggers the deployment', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { runWorkflow } = await import('../../services/github');

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.ok);
    expect(ui.asked).toEqual([]);
    expect(createFolder).toHaveBeenCalledTimes(4);
    expect(setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/tenants/acme/apps/cms',
      key: 'PAYLOAD_API_KEY',
      value: 'the-key'
    });
    expect(setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/tenants/acme/apps/cms',
      key: 'DEPLOY_ENABLED',
      value: 'true'
    });
    expect(runWorkflow).toHaveBeenCalledWith(
      '/repo',
      'fly-deployment.yml',
      'main',
      { app: 'cms', tenant: 'acme', environment: 'production' }
    );
    expect(ui.printed.outro[0]).toContain("Provisioned 'acme' in production");
  });

  it('writes the flag when it is the only thing absent', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    await existingFolder();

    await run();

    expect(setInfisicalSecret).toHaveBeenCalledTimes(1);
    expect(setInfisicalSecret).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'DEPLOY_ENABLED', value: 'true' })
    );
  });

  it('writes the local flag when only an imported one is true', async () => {
    const { setInfisicalSecret, readSecrets, readDeployFlag } =
      await import('../../services/infisical');
    await existingFolder();
    // The flattened record holds the imported flag; the folder's own is absent
    vi.mocked(readSecrets).mockResolvedValue({
      PAYLOAD_API_KEY: 'the-key',
      DEPLOY_ENABLED: 'true'
    });
    vi.mocked(readDeployFlag).mockResolvedValue(undefined);

    await run();

    expect(setInfisicalSecret).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'DEPLOY_ENABLED', value: 'true' })
    );
  });

  it('writes nothing when the flag is already true', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    await existingFolder('true');

    const { ui } = await run();

    expect(setInfisicalSecret).not.toHaveBeenCalled();
    expect(ui.printed.warn.join('\n')).not.toContain('paused');
  });

  it('leaves a false flag alone, warns and does not deploy it', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    const { runWorkflow } = await import('../../services/github');
    await existingFolder('false');

    const { ui } = await run();

    expect(setInfisicalSecret).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(ui.printed.warn.join('\n')).toContain(
      "'acme' stays paused in production for cms"
    );
  });

  it('shows the flag write in the plan and writes nothing on a dry run', async () => {
    const { setInfisicalSecret } = await import('../../services/infisical');
    await existingFolder();

    const { exit, ui } = await run(['--dry-run']);

    expect(exit).toBe(EXIT.ok);
    expect(setInfisicalSecret).not.toHaveBeenCalled();
    expect(ui.printed.note.join('\n')).toContain(
      'Set DEPLOY_ENABLED=true in /tenants/acme/apps/cms'
    );
  });
});
