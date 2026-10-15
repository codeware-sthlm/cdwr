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
  runCmsScript: vi.fn(async (_root: string, script: string) => ({
    stdout:
      script === 'set-tenant-stats-website.ts'
        ? `STATS_WEBSITE_SET=${JSON.stringify({ outcome: 'set' })}\n`
        : `TENANT_DEPLOYMENTS=${JSON.stringify([
            {
              id: 1,
              name: 'Acme',
              slug: 'acme',
              deployment: 'acme',
              apiKey: 'the-key',
              statsWebsiteId: null,
              domains: []
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
  dispatchWorkflow: vi.fn(
    async (): Promise<{ args: string[]; runId?: number }> => ({
      args: ['workflow', 'run', 'fly-deployment.yml'],
      runId: 42
    })
  ),
  viewRun: vi.fn(),
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

vi.mock('./provision.wait', () => ({
  awaitLive: vi.fn(async (): Promise<unknown> => ({ live: true }))
}));

vi.mock('../../services/umami', () => ({
  readUmamiProvisioning: vi.fn(async (): Promise<unknown> => ({
    status: 'unconfigured',
    missing: ['UMAMI_URL']
  })),
  getWebsite: vi.fn(async (): Promise<unknown> => null),
  listTeamWebsites: vi.fn(async (): Promise<unknown[]> => []),
  createWebsite: vi.fn(async (): Promise<unknown> => ({
    id: 'new-id',
    name: 'Acme',
    domain: 'cdwr-cms-acme.fly.dev'
  }))
}));

const run = async (
  extra: string[] = [],
  environment = 'production',
  apps = 'cms'
) => {
  const command = (await import('./provision')).default;
  const ui = fakeUi([]);
  const out: string[] = [];
  const exit = await runCommand({
    name: 'tenant provision',
    command,
    argv: [
      '--env',
      environment,
      '--workspace',
      'acme',
      '--apps',
      apps,
      '--yes',
      ...extra
    ],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: true,
    ui,
    history: () => undefined,
    stdout: (text: string) => {
      out.push(text);
    }
  });
  return { exit, ui, out: out.join('') };
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
    const { dispatchWorkflow } = await import('../../services/github');

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
    expect(dispatchWorkflow).toHaveBeenCalledWith(
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
    const { dispatchWorkflow } = await import('../../services/github');
    await existingFolder('false');

    const { ui } = await run();

    expect(setInfisicalSecret).not.toHaveBeenCalled();
    expect(dispatchWorkflow).not.toHaveBeenCalled();
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

  describe('statistics website', () => {
    const READY = {
      status: 'ready' as const,
      url: 'https://umami.test',
      apiKey: 'k',
      teamId: 'team'
    };
    const site = (id: string, domain: string) => ({ id, name: 'x', domain });

    const umami = async () => {
      const mod = await import('../../services/umami');
      vi.mocked(mod.readUmamiProvisioning).mockResolvedValue(READY);
      return mod;
    };

    /** The calls to the write-back script */
    const writes = async () => {
      const { runCmsScript } = await import('../../services/database');
      return vi
        .mocked(runCmsScript)
        .mock.calls.filter(
          ([, script]) => script === 'set-tenant-stats-website.ts'
        );
    };

    /** The listing script reports this row; the write-back script reports `outcome` */
    const scripts = async (
      overrides: Record<string, unknown> = {},
      report: Record<string, unknown> = { outcome: 'set' }
    ) => {
      const { runCmsScript } = await import('../../services/database');
      vi.mocked(runCmsScript).mockImplementation(async (_root, script) => ({
        stdout:
          script === 'set-tenant-stats-website.ts'
            ? `STATS_WEBSITE_SET=${JSON.stringify(report)}\n`
            : `TENANT_DEPLOYMENTS=${JSON.stringify([
                {
                  id: 1,
                  name: 'Acme',
                  slug: 'acme',
                  deployment: 'acme',
                  apiKey: 'the-key',
                  statsWebsiteId: null,
                  domains: [],
                  ...overrides
                }
              ])}\n`,
        stderr: ''
      }));
    };

    beforeEach(async () => {
      await scripts();
      const mod = await import('../../services/umami');
      vi.mocked(mod.readUmamiProvisioning).mockResolvedValue({
        status: 'unconfigured',
        missing: ['UMAMI_URL']
      });
      vi.mocked(mod.getWebsite).mockResolvedValue(null);
      vi.mocked(mod.listTeamWebsites).mockResolvedValue([]);
      vi.mocked(mod.createWebsite).mockResolvedValue({
        id: 'new-id',
        name: 'Acme',
        domain: 'cdwr-cms-acme.fly.dev'
      });
    });

    it('creates the website and writes its id back', async () => {
      const { createWebsite } = await umami();

      const { exit, ui } = await run();

      expect(exit).toBe(EXIT.ok);
      expect(createWebsite).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team' }),
        { name: 'Acme', domain: 'cdwr-cms-acme.fly.dev', teamId: 'team' }
      );
      const [call] = await writes();
      expect(call?.[3]).toMatchObject({
        STATS_TENANT_ID: '1',
        STATS_WEBSITE_ID: 'new-id'
      });
      expect(call?.[4]).toEqual({ reports: 'STATS_WEBSITE_SET' });
      expect(ui.printed.note.join('\n')).toContain(
        'Create statistics website cdwr-cms-acme.fly.dev in Umami'
      );
    });

    it('adopts a website that already has the domain', async () => {
      const { createWebsite, listTeamWebsites } = await umami();
      vi.mocked(listTeamWebsites).mockResolvedValue([
        site('found', 'CDWR-CMS-ACME.fly.dev')
      ]);

      await run();

      expect(createWebsite).not.toHaveBeenCalled();
      expect((await writes())[0]?.[3]).toMatchObject({
        STATS_WEBSITE_ID: 'found'
      });
    });

    it('uses the primary domain of the cms app', async () => {
      const { createWebsite } = await umami();
      await scripts({
        domains: [
          { hostname: 'acme.se', app: 'cdwr-cms-acme', isPrimary: true }
        ]
      });

      await run();

      expect(createWebsite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'acme.se' })
      );
    });

    it('keeps a website Umami still knows', async () => {
      const { getWebsite, createWebsite, listTeamWebsites } = await umami();
      await scripts({ statsWebsiteId: 'w1' });
      vi.mocked(getWebsite).mockResolvedValue(site('w1', 'acme.se'));

      const { ui } = await run();

      expect(getWebsite).toHaveBeenCalledWith(expect.anything(), 'w1');
      expect(listTeamWebsites).not.toHaveBeenCalled();
      expect(createWebsite).not.toHaveBeenCalled();
      expect(await writes()).toHaveLength(0);
      expect(ui.printed.note.join('\n')).toContain(
        'Keep statistics website w1'
      );
    });

    it('warns about an id Umami does not know and writes nothing', async () => {
      const { getWebsite, createWebsite } = await umami();
      await scripts({ statsWebsiteId: 'gone' });
      vi.mocked(getWebsite).mockResolvedValue(null);

      const { ui } = await run();

      expect(createWebsite).not.toHaveBeenCalled();
      expect(await writes()).toHaveLength(0);
      expect(ui.printed.warn.join('\n')).toContain(
        'Statistics website gone is unknown to Umami'
      );
    });

    it('skips the step when Umami is not configured', async () => {
      const { createWebsite } = await import('../../services/umami');
      const { dispatchWorkflow } = await import('../../services/github');

      const { exit, ui } = await run();

      expect(exit).toBe(EXIT.ok);
      expect(createWebsite).not.toHaveBeenCalled();
      expect(await writes()).toHaveLength(0);
      expect(ui.printed.note.join('\n')).toContain(
        'Statistics skipped: Umami not configured'
      );
      expect(dispatchWorkflow).toHaveBeenCalled();
    });

    it('skips a preview without reading the Umami credentials', async () => {
      const { readUmamiProvisioning } = await umami();
      const { listPreviewCmsApps } = await import('../../services/fly');
      vi.mocked(listPreviewCmsApps).mockResolvedValue(['cdwr-cms-acme-pr-1']);

      const { ui } = await run(
        ['--preview-app', 'cdwr-cms-acme-pr-1'],
        'preview'
      );

      expect(readUmamiProvisioning).not.toHaveBeenCalled();
      expect(ui.printed.note.join('\n')).toContain(
        'Statistics skipped: preview'
      );
    });

    it('creates nothing and writes nothing on a dry run', async () => {
      const { createWebsite } = await umami();

      const { ui } = await run(['--dry-run']);

      expect(createWebsite).not.toHaveBeenCalled();
      expect(await writes()).toHaveLength(0);
      expect(ui.printed.note.join('\n')).toContain('Create statistics website');
    });

    it('adopts at apply when the site appeared after the plan', async () => {
      const { createWebsite, listTeamWebsites } = await umami();
      vi.mocked(listTeamWebsites)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([site('late', 'cdwr-cms-acme.fly.dev')]);

      await run();

      expect(createWebsite).not.toHaveBeenCalled();
      expect((await writes())[0]?.[3]).toMatchObject({
        STATS_WEBSITE_ID: 'late'
      });
    });

    it('warns but neither fails nor stops the deploy when Umami fails in apply', async () => {
      const { createWebsite } = await umami();
      const { dispatchWorkflow } = await import('../../services/github');
      vi.mocked(createWebsite).mockRejectedValue(
        new Error('Umami refused the website creation: 500')
      );

      const { exit, ui } = await run();

      expect(exit).toBe(EXIT.ok);
      expect(ui.printed.warn.join('\n')).toContain(
        'Umami refused the website creation: 500'
      );
      expect(await writes()).toHaveLength(0);
      expect(dispatchWorkflow).toHaveBeenCalled();
    });

    it('does not fail the plan when Umami is unreachable', async () => {
      const { getWebsite, createWebsite, listTeamWebsites } = await umami();
      vi.mocked(listTeamWebsites).mockRejectedValue(new Error('timeout'));

      const { exit, ui } = await run();

      expect(exit).toBe(EXIT.ok);
      expect(createWebsite).not.toHaveBeenCalled();
      expect(getWebsite).not.toHaveBeenCalled();
      expect(ui.printed.warn.join('\n')).toContain('timeout');
      expect(ui.printed.note.join('\n')).toContain(
        'Statistics skipped: Umami did not answer'
      );
    });

    it('warns when the workspace holds another website id', async () => {
      await umami();
      await scripts({}, { outcome: 'conflict', current: 'other' });

      const { ui } = await run();

      const warned = ui.printed.warn.join('\n');
      expect(warned).toContain('other');
      expect(warned).toContain('new-id');
    });
  });

  describe('status flip', () => {
    /** The listing reports this status; the status script reports `report` */
    const scripts = async (
      status: 'pending' | 'active',
      report: Record<string, unknown> = { outcome: 'set' }
    ) => {
      const { runCmsScript } = await import('../../services/database');
      vi.mocked(runCmsScript).mockImplementation(async (_root, script) => ({
        stdout:
          script === 'set-tenant-status.ts'
            ? `TENANT_STATUS_SET=${JSON.stringify(report)}\n`
            : `TENANT_DEPLOYMENTS=${JSON.stringify([
                {
                  id: 1,
                  name: 'Acme',
                  slug: 'acme',
                  status,
                  deployment: 'acme',
                  apiKey: 'the-key',
                  statsWebsiteId: null,
                  domains: []
                }
              ])}\n`,
        stderr: ''
      }));
    };

    const flips = async () => {
      const { runCmsScript } = await import('../../services/database');
      return vi
        .mocked(runCmsScript)
        .mock.calls.filter(([, script]) => script === 'set-tenant-status.ts');
    };

    it('waits for the deployment, then activates a pending workspace', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('pending');

      const { exit, ui, out } = await run(['--json']);

      expect(exit).toBe(EXIT.ok);
      expect(awaitLive).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 42,
          healthUrl: 'https://cdwr-cms-acme.fly.dev/api/health'
        })
      );
      const [call] = await flips();
      expect(call?.[3]).toMatchObject({ STATUS_TENANT_ID: '1' });
      expect(call?.[4]).toEqual({ reports: 'TENANT_STATUS_SET' });
      expect(ui.printed.warn.join('\n')).not.toContain('pending');
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'flipped' }
      });
    });

    it('checks the site only when no deployment was needed', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('pending');
      await existingFolder('true');
      const { listAppNames } = await import('../../services/fly');
      vi.mocked(listAppNames).mockResolvedValueOnce(['cdwr-cms-acme']);

      await run();

      expect(awaitLive).toHaveBeenCalledWith(
        expect.objectContaining({ runId: undefined })
      );
      expect(await flips()).toHaveLength(1);
    });

    it('does not touch an active workspace', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('active');

      const { out } = await run(['--json']);

      expect(awaitLive).not.toHaveBeenCalled();
      expect(await flips()).toHaveLength(0);
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'not-applicable' }
      });
    });

    it('does not touch a pending workspace without the cms', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('pending');

      await run([], 'production', 'web');

      expect(awaitLive).not.toHaveBeenCalled();
      expect(await flips()).toHaveLength(0);
    });

    it('leaves the workspace pending when the dispatch names no run', async () => {
      const { awaitLive } = await import('./provision.wait');
      const { dispatchWorkflow } = await import('../../services/github');
      vi.mocked(dispatchWorkflow).mockResolvedValueOnce({ args: [] });
      await scripts('pending');

      const { ui, out } = await run(['--json']);

      expect(awaitLive).not.toHaveBeenCalled();
      expect(await flips()).toHaveLength(0);
      expect(ui.printed.warn.join('\n')).toContain(
        'the dispatch returned no run id'
      );
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'left-pending' }
      });
    });

    it('plans no flip and ends cleanly when the cms is paused', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('pending');
      await existingFolder('false');

      const plan = await run(['--dry-run']);
      expect(plan.ui.printed.note.join('\n')).not.toContain('Flip status');
      expect(plan.ui.printed.warn.join('\n')).toContain(
        'The cms is paused, so Acme stays pending'
      );

      const { exit, out } = await run(['--json']);

      expect(exit).toBe(EXIT.ok);
      expect(awaitLive).not.toHaveBeenCalled();
      expect(await flips()).toHaveLength(0);
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'cms-paused' }
      });
    });

    it.each(['--no-wait', '-S', '--skip-wait'])(
      'skips the wait and the flip on %s and says so',
      async (flag) => {
        const { awaitLive } = await import('./provision.wait');
        await scripts('pending');

        const { ui, out } = await run([flag, '--json']);

        expect(awaitLive).not.toHaveBeenCalled();
        expect(await flips()).toHaveLength(0);
        expect(ui.printed.warn.join('\n')).toContain('--no-wait');
        expect(JSON.parse(out)).toMatchObject({
          result: { statusFlip: 'no-wait' }
        });
      }
    );

    it('lists the flip in the plan and calls nothing on a dry run', async () => {
      const { awaitLive } = await import('./provision.wait');
      await scripts('pending');

      const { exit, ui } = await run(['--dry-run']);

      expect(exit).toBe(EXIT.ok);
      expect(ui.printed.note.join('\n')).toContain(
        'Flip status pending → active after the deploy is healthy'
      );
      expect(awaitLive).not.toHaveBeenCalled();
      expect(await flips()).toHaveLength(0);
    });

    it('leaves the workspace pending when the deployment or health fails', async () => {
      const { awaitLive } = await import('./provision.wait');
      vi.mocked(awaitLive).mockResolvedValueOnce({
        live: false,
        reason: 'the deployment run ended as failure (https://gh/run/2)'
      });
      await scripts('pending');

      const { exit, ui, out } = await run(['--json']);

      expect(exit).toBe(EXIT.failed);
      expect(await flips()).toHaveLength(0);
      const warned = ui.printed.warn.join('\n');
      expect(warned).toContain('Left pending');
      expect(warned).toContain('ended as failure');
      expect(warned).toContain('Run provision again once the site is up');
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'left-pending' }
      });
    });

    it('leaves the workspace pending when the script refuses', async () => {
      await scripts('pending', { outcome: 'conflict', current: 'suspended' });

      const { ui, out } = await run(['--json']);

      expect(ui.printed.warn.join('\n')).toContain("status 'suspended'");
      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'left-pending' }
      });
    });

    it('reports an unknown tenant as a failed flip, not a crash', async () => {
      await scripts('pending', {
        outcome: 'error',
        message: 'Tenant 1 not found'
      });

      const { exit, ui } = await run();

      expect(exit).toBe(EXIT.failed);
      expect(ui.printed.warn.join('\n')).toContain('Tenant 1 not found');
    });

    it('treats an already active workspace as unchanged', async () => {
      await scripts('pending', { outcome: 'unchanged' });

      const { out } = await run(['--json']);

      expect(JSON.parse(out)).toMatchObject({
        result: { statusFlip: 'unchanged' }
      });
    });
  });
});
