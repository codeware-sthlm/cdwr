import * as core from '@actions/core';
import * as github from '@actions/github';
import * as tenancy from '@codeware/shared/feature/tenancy';
import * as coreAction from '@codeware/shared/util/github';
import { analyzeAppsToDeploy } from '@codeware/shared/util/nx-deploy';

import { preDeploy } from './pre-deploy';
import type { ActionInputs } from './schemas/action-inputs.schema';

vi.mock('@actions/core');
vi.mock('@actions/github', () => ({
  ...vi.importActual('@actions/github'),
  // Make context mock editable
  context: {}
}));
vi.mock('@codeware/shared/util/github', async () => ({
  ...(await vi.importActual('@codeware/shared/util/github')),
  getRepositoryDefaultBranch: vi.fn()
}));
vi.mock('@codeware/shared/util/nx-deploy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codeware/shared/util/nx-deploy')>()),
  analyzeAppsToDeploy: vi.fn()
}));
// Partially mock the tenancy lib: override the fetchers
vi.mock('@codeware/shared/feature/tenancy', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@codeware/shared/feature/tenancy')
  >()),
  fetchAppSentry: vi.fn(),
  fetchDeployments: vi.fn()
}));

describe('preDeploy', () => {
  let originalToken: string;

  vi.mocked(coreAction.getRepositoryDefaultBranch).mockResolvedValue('main');

  // Dynamic mock values or spies
  const mockCoreInfo = vi.mocked(core.info);
  const mockCoreWarning = vi.mocked(core.warning);
  const mockGithubContext = vi.mocked(github.context);
  const mockAnalyzeAppsToDeploy = vi.mocked(analyzeAppsToDeploy);
  const mockFetchAppSentry = vi.mocked(tenancy.fetchAppSentry);
  const mockFetchDeployments = vi.mocked(tenancy.fetchDeployments);

  const infisicalInputs: Partial<ActionInputs> = {
    infisicalClientId: 'test-client-id',
    infisicalClientSecret: 'test-client-secret',
    infisicalProjectId: 'test-project-id',
    infisicalSite: 'eu'
  };

  /** An app that `analyzeAppsToDeploy` says to deploy */
  const deployable = (name: string) => ({
    projectName: name,
    status: 'deploy' as const,
    flyConfigFile: `apps/${name}/fly.toml`,
    githubConfig: {},
    version: '1.0.0',
    previousVersion: '0.9.0'
  });

  /** The same app as the action outputs it */
  const appOutput = (name: string) => ({
    name,
    flyConfigFile: `apps/${name}/fly.toml`,
    githubConfig: {},
    version: '1.0.0',
    previousVersion: '0.9.0'
  });

  /** What `fetchDeployments` finds in the vault */
  const mockDeployments = (
    deployments: tenancy.DeploymentsMap,
    skipped: Array<tenancy.SkippedDeployment> = []
  ) => mockFetchDeployments.mockResolvedValue({ deployments, skipped });

  /**
   * Set github context
   *
   * @param event Event context preset
   * @param override Override values
   */
  const setContext = (
    event: 'pull-request' | 'push-feature-branch' | 'push-main-branch' | 'tag'
  ) => {
    mockGithubContext.eventName =
      event === 'pull-request'
        ? 'pull_request'
        : event === 'tag'
          ? 'tag'
          : 'push';

    mockGithubContext.ref =
      event === 'pull-request'
        ? 'refs/heads/pr-branch'
        : event === 'push-main-branch'
          ? 'refs/heads/main'
          : event === 'push-feature-branch'
            ? 'refs/heads/feature'
            : 'refs/tags/tag';

    // Never changes
    mockGithubContext.repo = {
      owner: 'owner',
      repo: 'repo'
    };
  };

  /**
   * Setup test
   *
   * @param configOverride Additional config overrides
   * @returns Action inputs required values with optional overrides
   */
  const setupTest = (
    configOverride?: Partial<
      Pick<
        ActionInputs,
        | 'infisicalClientId'
        | 'infisicalClientSecret'
        | 'infisicalProjectId'
        | 'infisicalSite'
        | 'manualApp'
        | 'manualTenant'
        | 'manualEnvironment'
        | 'prNumber'
      >
    >
  ): ActionInputs => {
    return {
      ...{
        mainBranch: '',
        token: ''
      },
      ...configOverride
    };
  };

  beforeAll(() => {
    // Save original token
    originalToken = process.env['GITHUB_TOKEN'] as string;

    process.env['GITHUB_TOKEN'] = 'github-token';
  });

  afterAll(() => {
    if (originalToken) {
      process.env['GITHUB_TOKEN'] = originalToken;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    setContext('push-main-branch');

    // Default mocks
    mockAnalyzeAppsToDeploy.mockResolvedValue([]);
    mockFetchAppSentry.mockResolvedValue({});
    mockFetchDeployments.mockResolvedValue({ deployments: {}, skipped: [] });
  });

  describe('analyze environment', () => {
    it('should get valid migrate config from no inputs', async () => {
      const config = setupTest();

      expect(async () => await preDeploy(config, true)).not.toThrow();
    });

    it('should return preview for pull request', async () => {
      setContext('pull-request');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: 'preview'
      });
    });

    it('should return production for push to main branch', async () => {
      setContext('push-main-branch');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: 'production'
      });
    });

    it('should return empty for push to feature branch', async () => {
      setContext('push-feature-branch');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: ''
      });
    });

    it('should return empty for other events', async () => {
      setContext('tag');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: ''
      });
    });
  });

  describe('determine applications to deploy', () => {
    it('should filter and return only apps marked for deployment', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        {
          projectName: 'cms',
          status: 'skip',
          reason: 'Deployment is disabled'
        },
        deployable('api')
      ]);
      mockDeployments({ web: [{}], api: [{}] });

      setContext('push-main-branch');
      const config = setupTest(infisicalInputs);
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [appOutput('web'), appOutput('api')],
        appTenants: { web: [{}], api: [{}] },
        environment: 'production'
      });
      expect(mockCoreInfo).toHaveBeenCalledWith('Deploy: web @ 1.0.0');
      expect(mockCoreInfo).toHaveBeenCalledWith(
        'Skip: cms - Deployment is disabled'
      );
      expect(mockCoreInfo).toHaveBeenCalledWith('Deploy: api @ 1.0.0');
    });

    it('should return empty apps array when no apps are ready for deployment', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        {
          projectName: 'web',
          status: 'skip',
          reason: 'github.json not found'
        },
        {
          projectName: 'cms',
          status: 'skip',
          reason: 'Deployment is disabled'
        }
      ]);

      setContext('push-main-branch');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: 'production'
      });
    });

    it('should return empty apps array when analyzeAppsToDeploy returns empty', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([]);

      setContext('push-main-branch');
      const config = setupTest();
      const result = await preDeploy(config, true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: 'production'
      });
    });

    it('should call analyzeAppsToDeploy once', async () => {
      setContext('push-main-branch');
      const config = setupTest();
      await preDeploy(config, true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledTimes(1);
    });

    it('should pass environment to analyzeAppsToDeploy', async () => {
      setContext('push-main-branch');
      const config = setupTest();
      await preDeploy(config, true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'production',
        undefined,
        undefined
      );
    });
  });

  describe('release lane', () => {
    it('should scope previews to the pull request lane', async () => {
      setContext('pull-request');
      const config = setupTest({ prNumber: '467' });
      await preDeploy(config, true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'preview',
        'preview.467',
        undefined
      );
    });

    it('should fall back to lane 0 when a preview has no pull request number', async () => {
      // Without a preid nx resolves production versions, and the deployment
      // would push a real release tag from a preview run — advancing the
      // production baseline. Lane 0 is safe since PR numbers start at 1.
      setContext('pull-request');
      const config = setupTest();
      await preDeploy(config, true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'preview',
        'preview.0',
        undefined
      );
    });

    it('should never use a lane for production', async () => {
      setContext('push-main-branch');
      const config = setupTest({ prNumber: '467' });
      await preDeploy(config, true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'production',
        undefined,
        undefined
      );
    });
  });

  describe('deployment discovery', () => {
    it('should fail when credentials are missing and there is something to deploy', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      const result = await preDeploy(setupTest());

      expect(core.setFailed).toHaveBeenCalledWith(
        "Infisical credentials are required to decide where apps deploy in 'production'"
      );
      expect(result).toEqual({});
      expect(mockFetchDeployments).not.toHaveBeenCalled();
      expect(mockFetchAppSentry).not.toHaveBeenCalled();
    });

    it('should rethrow the missing credentials error when asked to', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      await expect(preDeploy(setupTest(), true)).rejects.toBe(
        "Infisical credentials are required to decide where apps deploy in 'production'"
      );
    });

    it('should not need credentials when environment is empty', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      setContext('push-feature-branch');
      const result = await preDeploy(setupTest(), true);

      expect(result.appTenants).toEqual({});
      expect(result.environment).toBe('');
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(mockFetchDeployments).not.toHaveBeenCalled();
      expect(mockCoreInfo).toHaveBeenCalledWith(
        'Skipping deployment discovery (no valid environment)'
      );
    });

    it('should not fetch from Infisical when environment is empty', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      setContext('push-feature-branch');
      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result).toEqual({
        apps: [appOutput('web')],
        appTenants: {},
        environment: ''
      });
      expect(mockFetchDeployments).not.toHaveBeenCalled();
      expect(mockFetchAppSentry).not.toHaveBeenCalled();
    });

    it('should not need credentials when there are no apps', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([]);

      const result = await preDeploy(setupTest(), true);

      expect(result).toEqual({
        apps: [],
        appTenants: {},
        environment: 'production'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(mockFetchDeployments).not.toHaveBeenCalled();
      expect(mockCoreInfo).toHaveBeenCalledWith(
        'Skipping deployment discovery (no apps to deploy)'
      );
    });

    it('should not fetch from Infisical when there are no apps', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([]);

      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockFetchDeployments).not.toHaveBeenCalled();
      expect(mockFetchAppSentry).not.toHaveBeenCalled();
    });

    it('should call fetchDeployments with the Infisical config and app names', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('cms')
      ]);

      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockFetchDeployments).toHaveBeenCalledTimes(1);
      expect(mockFetchDeployments).toHaveBeenCalledWith(
        {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          projectId: 'test-project-id',
          site: 'eu',
          environment: 'production'
        },
        ['web', 'cms']
      );
    });

    it('should use the preview environment for pull requests', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      setContext('pull-request');
      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockFetchDeployments).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'preview' }),
        ['web']
      );
    });

    it('should use US site when configured', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      await preDeploy(
        setupTest({ ...infisicalInputs, infisicalSite: 'us' }),
        true
      );

      expect(mockFetchDeployments).toHaveBeenCalledWith(
        expect.objectContaining({ site: 'us' }),
        ['web']
      );
    });

    it('should default to the EU site', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);

      await preDeploy(
        setupTest({ ...infisicalInputs, infisicalSite: undefined }),
        true
      );

      expect(mockFetchDeployments).toHaveBeenCalledWith(
        expect.objectContaining({ site: 'eu' }),
        ['web']
      );
    });

    it('should pass host and tenants through as appTenants, host first', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('cms')
      ]);
      mockDeployments({
        web: [
          {},
          { tenant: 'acme', env: { PUBLIC_URL: 'https://acme.com' } },
          { tenant: 'demo', secrets: { API_KEY: 'secret' } }
        ],
        cms: [{ tenant: 'demo' }]
      });

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.appTenants).toEqual({
        web: [
          {},
          { tenant: 'acme', env: { PUBLIC_URL: 'https://acme.com' } },
          { tenant: 'demo', secrets: { API_KEY: 'secret' } }
        ],
        cms: [{ tenant: 'demo' }]
      });
      expect(result.apps.map((a) => a.name)).toEqual(['web', 'cms']);
      expect(mockCoreInfo).toHaveBeenCalledWith(
        'Deploy web to: <host>, acme, demo'
      );
    });

    it('should deploy a host-only app with a single host entry', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('builder')]);
      mockDeployments({ builder: [{}] });

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps.map((a) => a.name)).toEqual(['builder']);
      expect(result.appTenants).toEqual({ builder: [{}] });
    });

    it('should deploy tenants of an app whose host is off', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('cms')]);
      mockDeployments({ cms: [{ tenant: 'acme' }] }, [
        { app: 'cms', reason: 'flag-off' }
      ]);

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.appTenants).toEqual({ cms: [{ tenant: 'acme' }] });
    });

    it('should drop an app that has nothing enabled, naming the flag-off reason', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('cms')
      ]);
      mockDeployments({ web: [], cms: [{ tenant: 'demo' }] }, [
        { app: 'web', tenant: 'demo', reason: 'flag-off' }
      ]);

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps.map((a) => a.name)).toEqual(['cms']);
      expect(result.appTenants).toEqual({ cms: [{ tenant: 'demo' }] });
      expect(mockCoreWarning).toHaveBeenCalledWith(
        "Skip: web - nothing enabled in 'production' (demo: DEPLOY_ENABLED is not true)"
      );
    });

    it('should drop an app that has secrets but no flag, naming the no-flag reason', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);
      mockDeployments({ web: [] }, [
        { app: 'web', reason: 'no-flag' },
        { app: 'web', tenant: 'demo', reason: 'flag-off' }
      ]);

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps).toEqual([]);
      expect(result.appTenants).toEqual({});
      expect(mockCoreWarning).toHaveBeenCalledWith(
        "Skip: web - nothing enabled in 'production' (host: no DEPLOY_ENABLED secret, demo: DEPLOY_ENABLED is not true)"
      );
    });

    it('should drop an app that has no folder at all', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);
      mockDeployments({ web: [] });

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps).toEqual([]);
      expect(result.appTenants).toEqual({});
      expect(mockCoreWarning).toHaveBeenCalledWith(
        "Skip: web - nothing enabled in 'production' (no folder sets DEPLOY_ENABLED)"
      );
    });

    it('should drop web with only a preview tenant in production, never a bare host app', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('builder')
      ]);
      // The preview tenant's flag lives in the preview environment, so
      // production sees nothing for web
      mockDeployments({ web: [], builder: [{}] });

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps.map((a) => a.name)).toEqual(['builder']);
      expect(result.appTenants).toEqual({ builder: [{}] });
      expect(result.appTenants).not.toHaveProperty('web');
    });

    it('should drop an app that is also not in the discovered map', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);
      mockDeployments({});

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps).toEqual([]);
      expect(result.appTenants).toEqual({});
    });
  });

  describe('sentry configuration', () => {
    it('should attach Sentry details to the apps that have them', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('cms')
      ]);
      mockDeployments({ web: [{}], cms: [{}] });
      mockFetchAppSentry.mockResolvedValue({
        web: { project: 'web', dsn: 'https://web@sentry.io/2' }
      });

      const result = await preDeploy(setupTest(infisicalInputs), true);

      expect(result.apps).toEqual([
        {
          ...appOutput('web'),
          sentry: { project: 'web', dsn: 'https://web@sentry.io/2' }
        },
        appOutput('cms')
      ]);
      expect(mockFetchAppSentry).toHaveBeenCalledWith(
        {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          projectId: 'test-project-id',
          site: 'eu',
          environment: 'production'
        },
        ['web', 'cms']
      );
    });

    it('should fetch Sentry only for the apps that remain', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([
        deployable('web'),
        deployable('cms'),
        deployable('builder')
      ]);
      mockDeployments({ web: [], cms: [{ tenant: 'demo' }], builder: [{}] });

      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockFetchAppSentry).toHaveBeenCalledTimes(1);
      expect(mockFetchAppSentry).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
        ['cms', 'builder']
      );
    });

    it('should fetch Sentry after discovery', async () => {
      mockAnalyzeAppsToDeploy.mockResolvedValue([deployable('web')]);
      mockDeployments({ web: [{}] });

      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockFetchDeployments.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetchAppSentry.mock.invocationCallOrder[0]
      );
    });
  });

  describe('manual deployment overrides', () => {
    const allApps = [deployable('web'), deployable('cms')];

    beforeEach(() => {
      mockAnalyzeAppsToDeploy.mockImplementation(async (_env, _preid, apps) =>
        apps ? allApps.filter((a) => apps.includes(a.projectName)) : allApps
      );
    });

    it('should override environment when manualEnvironment is provided', async () => {
      setContext('push-feature-branch'); // Normally no environment
      const config = setupTest({
        ...infisicalInputs,
        manualEnvironment: 'production'
      });
      const result = await preDeploy(config, true);

      expect(result.environment).toBe('production');
      expect(mockCoreInfo).toHaveBeenCalledWith(
        expect.stringContaining('Manual environment override: production')
      );
    });

    it('should discover with the manual environment', async () => {
      setContext('push-feature-branch'); // Normally no environment
      const config = setupTest({
        ...infisicalInputs,
        manualEnvironment: 'preview'
      });

      await preDeploy(config, true);

      expect(mockFetchDeployments).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'preview' }),
        ['web', 'cms']
      );
    });

    it('should override app when manualApp is provided', async () => {
      mockDeployments({ cms: [{}] });
      const config = setupTest({ ...infisicalInputs, manualApp: 'cms' });
      const result = await preDeploy(config, true);

      expect(result.apps).toEqual([appOutput('cms')]);
      expect(mockCoreInfo).toHaveBeenCalledWith('Manual app override: cms');
      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'production',
        undefined,
        ['cms']
      );
    });

    it('should keep only the manual tenant and drop the host and other tenants', async () => {
      mockDeployments({
        web: [{}, { tenant: 'demo' }, { tenant: 'acme' }, { tenant: 'globex' }],
        cms: [{ tenant: 'acme', env: { A: '1' } }]
      });
      const config = setupTest({ ...infisicalInputs, manualTenant: 'acme' });

      const result = await preDeploy(config, true);

      expect(result.appTenants).toEqual({
        web: [{ tenant: 'acme' }],
        cms: [{ tenant: 'acme', env: { A: '1' } }]
      });
      expect(mockCoreInfo).toHaveBeenCalledWith('Manual tenant override: acme');
    });

    it('should drop an app left with nothing for the manual tenant', async () => {
      mockDeployments({
        web: [{}, { tenant: 'demo' }],
        cms: [{ tenant: 'acme' }]
      });
      const config = setupTest({ ...infisicalInputs, manualTenant: 'acme' });

      const result = await preDeploy(config, true);

      expect(result.apps.map((a) => a.name)).toEqual(['cms']);
      expect(result.appTenants).toEqual({ cms: [{ tenant: 'acme' }] });
      expect(mockCoreWarning).toHaveBeenCalledWith(
        "Skip: web - no deployment for tenant 'acme'"
      );
      expect(mockFetchAppSentry).toHaveBeenCalledWith(expect.anything(), [
        'cms'
      ]);
    });

    it('should never add a tenant whose flag is off', async () => {
      mockDeployments({ web: [], cms: [] }, [
        { app: 'web', tenant: 'acme', reason: 'flag-off' }
      ]);
      const config = setupTest({ ...infisicalInputs, manualTenant: 'acme' });

      const result = await preDeploy(config, true);

      expect(result.apps).toEqual([]);
      expect(result.appTenants).toEqual({});
      expect(mockCoreWarning).toHaveBeenCalledWith(
        "Skip: web - nothing enabled in 'production' (acme: DEPLOY_ENABLED is not true)"
      );
    });

    it('should combine manual app, tenant, and environment overrides', async () => {
      setContext('push-feature-branch'); // Normally no environment
      mockDeployments({ web: [{}, { tenant: 'demo' }, { tenant: 'acme' }] });
      const config = setupTest({
        ...infisicalInputs,
        manualApp: 'web',
        manualTenant: 'demo',
        manualEnvironment: 'production'
      });

      const result = await preDeploy(config, true);

      expect(result.apps).toEqual([appOutput('web')]);
      expect(result.environment).toBe('production');
      expect(result.appTenants).toEqual({ web: [{ tenant: 'demo' }] });
      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'production',
        undefined,
        ['web']
      );
    });

    it('should combine manual app and environment overrides', async () => {
      setContext('push-feature-branch'); // Normally no environment
      mockDeployments({ web: [{ tenant: 'demo' }] });
      const config = setupTest({
        ...infisicalInputs,
        manualApp: 'web',
        manualEnvironment: 'preview'
      });

      const result = await preDeploy(config, true);

      expect(result.apps).toEqual([appOutput('web')]);
      expect(result.environment).toBe('preview');
      // Manual dispatch with no PR number still gets a preview lane, never the
      // production one
      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'preview',
        'preview.0',
        ['web']
      );
    });

    it('should not affect affected app analysis when manual overrides are not provided', async () => {
      await preDeploy(setupTest(infisicalInputs), true);

      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeAppsToDeploy).toHaveBeenCalledWith(
        'production',
        undefined,
        undefined
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Mock error response for a function called early in the flow
      mockCoreInfo.mockImplementation(() => {
        throw new Error('error message');
      });
    });

    it('should set failed error message', async () => {
      const config = setupTest();
      await preDeploy(config);

      expect(core.setFailed).toHaveBeenCalledWith('error message');
    });

    it('should return empty object', async () => {
      const config = setupTest();
      const result = await preDeploy(config);

      expect(result).toEqual({});
    });

    it('should not passthough exceptions by default', async () => {
      const config = setupTest();

      expect(async () => await preDeploy(config)).not.toThrow();
    });

    it('should passthough exceptions', async () => {
      const config = setupTest();

      let error;
      let result;

      try {
        result = await preDeploy(config, true);
      } catch (e) {
        error = e;
      }

      expect(error).toBe('error message');
      expect(result).toBeUndefined();
    });
  });
});
