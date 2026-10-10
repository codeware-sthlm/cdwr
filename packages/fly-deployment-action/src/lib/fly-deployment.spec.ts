import * as core from '@actions/core';
import * as github from '@actions/github';
import type { context } from '@actions/github';
import { type DeployAppOptions, Fly } from '@cdwr/fly-node';
import * as coreAction from '@codeware/shared/util/github';
import type { PullRequestEvent } from '@octokit/webhooks-types';
import { vol } from 'memfs';

import { flyDeployment } from './fly-deployment';
import type { ActionInputs } from './schemas/action-inputs.schema';
import { ActionOutputs } from './schemas/action-outputs.schema';

type WebhookPayload = (typeof context)['payload'];

// Mock strategy:
// - Wrap every module/function with `vi.mock` to mock away the real implementation
// - Create a mock function for those functions that needs to be interacted with
vi.mock('fs', async () => {
  const memfs = await vi.importActual('memfs');
  return {
    ...memfs,
    default: memfs,
    promises: memfs['promises'],
    existsSync: memfs['existsSync'],
    readFileSync: memfs['readFileSync'],
    __esModule: true
  };
});
vi.mock('@homebridge/node-pty-prebuilt-multiarch', () => ({
  spawn: vi.fn()
}));
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
vi.mock('@cdwr/fly-node');

describe('flyDeployment', () => {
  // Save environment variables before tests
  let envFlyPostgres: {
    preview?: string;
    production?: string;
  };

  // Static mock values
  vi.mocked(coreAction.getRepositoryDefaultBranch).mockResolvedValue('main');

  // Dynamic mock values or spies
  const mockCoreEndGroup = vi.mocked(core.endGroup);
  const mockCoreInfo = vi.mocked(core.info);
  const mockCoreStartGroup = vi.mocked(core.startGroup);
  const mockCoreWarning = vi.mocked(core.warning);
  const mockGithubContext = vi.mocked(github.context);
  const mockFly = vi.mocked(Fly);

  /**
   * Helper to get the mocked Fly instance to interact and spy on methods
   */
  const getMockFly = () =>
    mockFly.mock.results[0].value as typeof Fly.prototype;

  /**
   * Set github context
   *
   * @param event Event context preset
   * @param override Override values
   */
  const setContext = (
    event:
      'pr-closed' | 'pr-opened' | 'push-feature-branch' | 'push-main-branch',
    override?: Pick<typeof github.context, 'eventName' | 'payload'>
  ) => {
    const isPR = event.match(/pr-/);
    const payload =
      event === 'pr-closed'
        ? ({
            number: 1,
            pull_request: { state: 'closed' }
          } as PullRequestEvent)
        : event === 'pr-opened'
          ? ({
              number: 1,
              pull_request: { state: 'open' }
            } as PullRequestEvent)
          : undefined;

    mockGithubContext.eventName = override?.eventName
      ? override.eventName
      : isPR
        ? 'pull_request'
        : 'push';

    mockGithubContext.payload = {
      ...payload,
      ...(override?.payload ?? {})
    } as WebhookPayload;

    // Never changes
    mockGithubContext.ref = 'refs/heads/main';
    mockGithubContext.repo = {
      owner: 'owner',
      repo: 'repo'
    };
  };

  /**
   * Setup mock implementations
   *
   * - Virtual file system (for fly.toml and github.json)
   * - Fly class
   * - Debug logging
   */
  const setupMocks = (
    overrides: {
      /**
       * Deployed apps than can be destroyed
       * @default
       * [{ name: 'app-one' }, { name: 'app-two' }]
       */
      flyApps?: Awaited<ReturnType<typeof Fly.prototype.apps.list>>;
      /**
       * Environment variable values for postgres cluster name keys.
       * - preview: `${TEST_FLY_POSTGRES_PREVIEW}`
       * - production: `${TEST_FLY_POSTGRES_PRODUCTION}`
       *
       * **ONLY** in `/apps/app-one/github.json`.
       *
       * `null` value will delete the environment variable.
       * @default
       * {
       *   TEST_FLY_POSTGRES_PREVIEW: 'pg-preview',
       *   TEST_FLY_POSTGRES_PRODUCTION: 'pg-production'
       * }
       */
      envFlyPostgres?: {
        TEST_FLY_POSTGRES_PREVIEW?: string | null;
        TEST_FLY_POSTGRES_PRODUCTION?: string | null;
      };
    } = {}
  ) => {
    const { flyApps, envFlyPostgres } = {
      flyApps: overrides.flyApps || [{ name: 'app-one' }, { name: 'app-two' }],
      envFlyPostgres: overrides.envFlyPostgres || {
        TEST_FLY_POSTGRES_PREVIEW: 'pg-preview',
        TEST_FLY_POSTGRES_PRODUCTION: 'pg-production'
      }
    };

    // Environment variables
    if (envFlyPostgres.TEST_FLY_POSTGRES_PREVIEW !== null) {
      process.env['TEST_FLY_POSTGRES_PREVIEW'] =
        envFlyPostgres.TEST_FLY_POSTGRES_PREVIEW;
    } else {
      delete process.env['TEST_FLY_POSTGRES_PREVIEW'];
    }
    if (envFlyPostgres.TEST_FLY_POSTGRES_PRODUCTION !== null) {
      process.env['TEST_FLY_POSTGRES_PRODUCTION'] =
        envFlyPostgres.TEST_FLY_POSTGRES_PRODUCTION;
    } else {
      delete process.env['TEST_FLY_POSTGRES_PRODUCTION'];
    }

    // Create virtual file system for fly.toml and github.json files
    // app-one uses default fly config and app-two uses default and production-specific fly configs.
    // app-one has postgres setup, app-two does not.
    vol.reset();
    vol.fromNestedJSON({
      '/apps/app-one': {
        'fly.toml': '',
        'github.json': JSON.stringify({
          flyPostgresPreview: '${TEST_FLY_POSTGRES_PREVIEW}',
          flyPostgresProduction: '${TEST_FLY_POSTGRES_PRODUCTION}',
          flyPostgresDatabaseName: 'shared_db'
        })
      },
      '/apps/app-two': {
        'fly.toml': '',
        'fly.production.toml': '',
        'github.json': JSON.stringify({})
      }
    });

    // Debug logging
    mockCoreEndGroup.mockImplementation(() => console.log('[GRP-]'));
    mockCoreInfo.mockImplementation((msg) => console.log(`[INFO] ${msg}`));
    mockCoreStartGroup.mockImplementation((msg) =>
      console.log(`[GRP+] ${msg}`)
    );
    mockCoreWarning.mockImplementation((msg) => console.log(`[WARN] ${msg}`));

    // Mock Fly class
    mockFly.mockImplementation(function () {
      return {
        apps: {
          destroy: vi.fn(),
          // Deployed apps than can be destroyed
          list: vi.fn().mockResolvedValue(flyApps)
        },
        build: vi.fn().mockImplementation(({ app }) =>
          Promise.resolve({
            appName: app,
            imageRef: `registry.fly.io/${app}:deployment-abc123`
          })
        ),
        cli: {
          isInstalled: vi.fn().mockResolvedValue(true)
        },
        config: {
          show: vi.fn().mockImplementation(({ config }) =>
            Promise.resolve({
              // App name from fly.toml is '{app-name}-config'
              app: config.replace(/\/apps\/([^/]+)\/.*/, '$1-config')
            })
          )
        },
        deploy: vi.fn().mockImplementation(({ app }) =>
          Promise.resolve({
            app,
            url: `https://${app}.fly.dev`
          })
        ),
        isReady: vi.fn(),
        secrets: {
          set: vi.fn().mockResolvedValue(undefined),
          unset: vi.fn().mockResolvedValue(undefined)
        },
        status: vi.fn().mockResolvedValue(null)
      } as unknown as Fly;
    });
  };

  /**
   * Default enriched apps for tests.
   * NOTE: withEnvVars should have already resolved ${...} templates to actual values
   * when pre-deploy runs analyzeAppsToDeploy. These represent the pre-resolved output.
   */
  const getDefaultApps = (
    env: 'preview' | 'production' = 'production'
  ): ActionInputs['apps'] => [
    {
      name: 'app-one',
      flyConfigFile: '/apps/app-one/fly.toml',
      version: '1.0.0',
      previousVersion: '0.9.0',
      githubConfig: {
        flyPostgresPreview: 'pg-preview',
        flyPostgresProduction: 'pg-production',
        flyPostgresDatabaseName: 'shared_db'
      }
    },
    {
      name: 'app-two',
      flyConfigFile: `/apps/app-two/fly${env === 'production' ? '.production' : ''}.toml`,
      version: '2.0.0',
      previousVersion: '0.9.0',
      githubConfig: {}
    }
  ];

  /**
   * Setup test
   *
   * @param configOverride Additional config overrides
   * @param env Environment for selecting default fly configs
   * @returns Action inputs required values with optional overrides
   */
  const setupTest = (
    configOverride?: Partial<ActionInputs>,
    env: 'preview' | 'production' = 'production'
  ): ActionInputs => {
    return {
      apps: getDefaultApps(env),
      appDetails: { 'app-one': [{}], 'app-two': [{}] },
      env: [],
      environment: env,
      flyApiToken: 'fly-api-token',
      flyOrg: 'fly-org',
      flyRegion: '',
      flyTraceCli: false,
      flyConsoleLogs: false,
      optOutDepotBuilder: false,
      secrets: [],
      token: 'token',
      ...configOverride
    };
  };

  beforeAll(() => {
    process.on('unhandledRejection', (err) => {
      throw err;
    });
    process.on('uncaughtException', (err) => {
      throw err;
    });

    envFlyPostgres = {
      preview: process.env['TEST_FLY_POSTGRES_PREVIEW'],
      production: process.env['TEST_FLY_POSTGRES_PRODUCTION']
    };
  });

  afterAll(() => {
    if (envFlyPostgres.preview) {
      process.env['TEST_FLY_POSTGRES_PREVIEW'] = envFlyPostgres.preview;
    } else {
      delete process.env['TEST_FLY_POSTGRES_PREVIEW'];
    }
    if (envFlyPostgres.production) {
      process.env['TEST_FLY_POSTGRES_PRODUCTION'] = envFlyPostgres.production;
    } else {
      delete process.env['TEST_FLY_POSTGRES_PRODUCTION'];
    }
  });

  beforeEach(() => {
    // Clear the virtual file system before each test
    vol.reset();

    vi.clearAllMocks();

    setupMocks();
    setContext('push-main-branch');
  });

  describe('start up', () => {
    it('should not throw passing only required inputs', async () => {
      // const config = setupTest();

      // expect(config).toEqual({
      //   appDetails: {},
      //   env: [],
      //   flyApiToken: 'fly-api-token',
      //   flyOrg: 'fly-org',
      //   flyRegion: '',
      //   mainBranch: '',
      //   optOutDepotBuilder: false,
      //   secrets: [],
      //   token: 'token'
      // } satisfies ActionInputs);

      expect(
        async () =>
          await flyDeployment(
            {
              apps: [],
              environment: 'production',
              flyApiToken: 'fly-api-token', // Not required as input, but required in config
              token: 'token'
            },
            true
          )
      ).not.toThrow();
    });

    it('should fail deployment when fly token is missing', async () => {
      const config = setupTest({ flyApiToken: '' });

      await expect(
        async () => await flyDeployment(config, true)
      ).rejects.toThrow('token is required');
    });

    it('should fail deployment when github token is missing', async () => {
      const config = setupTest({ token: '' });

      await expect(
        async () => await flyDeployment(config, true)
      ).rejects.toThrow('token is required');
    });
  });

  describe('deploy to preview', () => {
    it('should deploy to preview when apps are ready', async () => {
      setContext('pr-opened');
      setupMocks();
      const config = setupTest({}, 'preview');
      const result = await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          env: {
            APP_NAME: 'app-one-config-pr-1',
            FLY_URL: 'https://app-one-config-pr-1.fly.dev',
            PR_NUMBER: '1'
          },
          environment: 'preview'
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          env: {
            APP_NAME: 'app-two-config-pr-1',
            FLY_URL: 'https://app-two-config-pr-1.fly.dev',
            PR_NUMBER: '1'
          },
          environment: 'preview'
        } satisfies DeployAppOptions)
      );

      expect(result).toEqual({
        environment: 'preview',
        projects: [
          {
            action: 'deploy',
            app: 'app-one-config-pr-1',
            name: 'app-one',
            projectName: 'app-one',
            url: 'https://app-one-config-pr-1.fly.dev'
          },
          {
            action: 'deploy',
            app: 'app-two-config-pr-1',
            name: 'app-two',
            projectName: 'app-two',
            url: 'https://app-two-config-pr-1.fly.dev'
          }
        ]
      } satisfies ActionOutputs);
    });

    it('should deploy apps to preview with environment variables', async () => {
      setContext('pr-opened');
      setupMocks();
      const config = setupTest(
        {
          env: ['ENV_KEY1=env-value1', 'ENV_KEY2=env-value2']
        },
        'preview'
      );
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          environment: 'preview',
          env: {
            APP_NAME: 'app-one-config-pr-1',
            ENV_KEY1: 'env-value1',
            ENV_KEY2: 'env-value2',
            FLY_URL: 'https://app-one-config-pr-1.fly.dev',
            PR_NUMBER: '1'
          }
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          environment: 'preview',
          env: {
            APP_NAME: 'app-two-config-pr-1',
            ENV_KEY1: 'env-value1',
            ENV_KEY2: 'env-value2',
            FLY_URL: 'https://app-two-config-pr-1.fly.dev',
            PR_NUMBER: '1'
          }
        } satisfies DeployAppOptions)
      );
    });

    it('should deploy an app with its own Sentry details as env', async () => {
      setContext('pr-opened');
      setupMocks();
      const apps = getDefaultApps('preview');
      const config = setupTest(
        {
          apps: [
            {
              ...apps[0],
              sentry: {
                project: 'app-one',
                dsn: 'https://one@sentry.io/1',
                release: 'app-one@1.2.3+abc1234'
              }
            },
            apps[1]
          ],
          env: ['SENTRY_ORG=acme']
        },
        'preview'
      );
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          env: {
            APP_NAME: 'app-one-config-pr-1',
            FLY_URL: 'https://app-one-config-pr-1.fly.dev',
            PR_NUMBER: '1',
            SENTRY_ORG: 'acme',
            SENTRY_DSN: 'https://one@sentry.io/1',
            SENTRY_PROJECT: 'app-one',
            SENTRY_RELEASE: 'app-one@1.2.3+abc1234'
          }
        } satisfies Partial<DeployAppOptions>)
      );

      // The app without Sentry details only gets the shared env
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          env: {
            APP_NAME: 'app-two-config-pr-1',
            FLY_URL: 'https://app-two-config-pr-1.fly.dev',
            PR_NUMBER: '1',
            SENTRY_ORG: 'acme'
          }
        } satisfies Partial<DeployAppOptions>)
      );
    });

    it('should deploy apps to preview with the same secrets', async () => {
      setContext('pr-opened');
      setupMocks();
      const config = setupTest(
        {
          secrets: ['SECRET_KEY1=secret-value1', 'SECRET_KEY2=secret-value2']
        },
        'preview'
      );
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          environment: 'preview',
          secrets: {
            SECRET_KEY1: 'secret-value1',
            SECRET_KEY2: 'secret-value2'
          }
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          environment: 'preview',
          secrets: {
            SECRET_KEY1: 'secret-value1',
            SECRET_KEY2: 'secret-value2'
          }
        } satisfies DeployAppOptions)
      );
    });

    it('should deploy apps to preview and attach to postgres when preview cluster is set', async () => {
      setContext('pr-opened');
      setupMocks();
      const config = setupTest({}, 'preview');
      await flyDeployment(config, true);

      // app-one has postgres setup, app-two does not.
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          environment: 'preview',
          postgres: 'pg-preview'
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          environment: 'preview'
        })
      );
    });

    it('should deploy apps to preview and not attach to postgres when only production cluster is set', async () => {
      setContext('pr-opened');
      setupMocks({ envFlyPostgres: { TEST_FLY_POSTGRES_PREVIEW: undefined } });

      const config = setupTest(
        {
          apps: [
            {
              name: 'app-one',
              flyConfigFile: '/apps/app-one/fly.toml',
              version: '1.0.0',
              previousVersion: '0.9.0',
              githubConfig: { flyPostgresProduction: 'pg-production' }
            },
            {
              name: 'app-two',
              flyConfigFile: '/apps/app-two/fly.toml',
              version: '2.0.0',
              previousVersion: '0.9.0',
              githubConfig: {}
            }
          ]
        },
        'preview'
      );
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          environment: 'preview'
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          environment: 'preview'
        })
      );
    });

    it('should deploy apps to preview and opt out of depot builder', async () => {
      setContext('pr-opened');
      setupMocks();
      const config = setupTest({ optOutDepotBuilder: true }, 'preview');
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-1',
          config: '/apps/app-one/fly.toml',
          environment: 'preview',
          optOutDepotBuilder: true
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-pr-1',
          config: '/apps/app-two/fly.toml',
          environment: 'preview',
          optOutDepotBuilder: true
        })
      );
    });
  });

  describe('deploy to production', () => {
    it('should return empty projects when nothing to deploy', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({ apps: [] });
      const result = await flyDeployment(config, true);

      expect(result).toEqual({ environment: expect.any(String), projects: [] });
    });

    it('should deploy to production when apps are ready', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest();
      const result = await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          env: {
            APP_NAME: 'app-one-config',
            FLY_URL: 'https://app-one-config.fly.dev',
            PR_NUMBER: ''
          },
          environment: 'production'
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          env: {
            APP_NAME: 'app-two-config',
            FLY_URL: 'https://app-two-config.fly.dev',
            PR_NUMBER: ''
          },
          environment: 'production'
        } satisfies DeployAppOptions)
      );

      expect(result).toEqual({
        environment: 'production',
        projects: [
          {
            action: 'deploy',
            app: 'app-one-config',
            name: 'app-one',
            projectName: 'app-one',
            url: 'https://app-one-config.fly.dev'
          },
          {
            action: 'deploy',
            app: 'app-two-config',
            name: 'app-two',
            projectName: 'app-two',
            url: 'https://app-two-config.fly.dev'
          }
        ]
      } satisfies ActionOutputs);
    });

    it('should deploy apps to production with environment variables', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        env: [
          'APP_NAME=app-one',
          'ENV_KEY1=env"fnutt',
          'ENV_KEY2=env space',
          'ENV_KEY3=env\\backslash',
          'PR_NUMBER='
        ]
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          environment: 'production',
          env: {
            APP_NAME: 'app-one-config',
            ENV_KEY1: 'env"fnutt',
            ENV_KEY2: 'env space',
            ENV_KEY3: 'env\\backslash',
            FLY_URL: 'https://app-one-config.fly.dev',
            PR_NUMBER: ''
          }
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          environment: 'production',
          env: {
            APP_NAME: 'app-two-config',
            ENV_KEY1: 'env"fnutt',
            ENV_KEY2: 'env space',
            ENV_KEY3: 'env\\backslash',
            FLY_URL: 'https://app-two-config.fly.dev',
            PR_NUMBER: ''
          }
        } satisfies DeployAppOptions)
      );
    });

    it('should deploy apps to production with the same secrets', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        secrets: [
          'SECRET_KEY1=secret"fnutt',
          'SECRET_KEY2=secret space',
          'SECRET_KEY3=secret\\backslash'
        ]
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          environment: 'production',
          secrets: {
            SECRET_KEY1: 'secret"fnutt',
            SECRET_KEY2: 'secret space',
            SECRET_KEY3: 'secret\\backslash'
          }
        } satisfies DeployAppOptions)
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          environment: 'production',
          secrets: {
            SECRET_KEY1: 'secret"fnutt',
            SECRET_KEY2: 'secret space',
            SECRET_KEY3: 'secret\\backslash'
          }
        } satisfies DeployAppOptions)
      );
    });

    it('should deploy apps to production and attach to postgres production when production cluster is set', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest();
      await flyDeployment(config, true);

      // app-one has postgres setup, app-two does not.
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          environment: 'production',
          postgres: 'pg-production'
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          environment: 'production'
        })
      );
    });

    it('should deploy apps to production and not attach to postgres production when only preview cluster is set', async () => {
      setContext('push-main-branch');
      setupMocks({
        envFlyPostgres: { TEST_FLY_POSTGRES_PRODUCTION: undefined }
      });

      const config = setupTest({
        apps: [
          {
            name: 'app-one',
            flyConfigFile: '/apps/app-one/fly.toml',
            version: '1.0.0',
            previousVersion: '0.9.0',
            githubConfig: { flyPostgresPreview: 'pg-preview' }
          },
          {
            name: 'app-two',
            flyConfigFile: '/apps/app-two/fly.production.toml',
            version: '2.0.0',
            previousVersion: '0.9.0',
            githubConfig: {}
          }
        ]
      });
      await flyDeployment(config, true);

      // app-one has postgres setup, app-two does not.
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          environment: 'production'
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          environment: 'production'
        })
      );
    });

    it('should deploy apps to production and opt out of depot builder', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({ optOutDepotBuilder: true });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          environment: 'production',
          optOutDepotBuilder: true
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          config: '/apps/app-two/fly.production.toml',
          environment: 'production',
          optOutDepotBuilder: true
        })
      );
    });

    it('should deploy apps to production with multiple tenants', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        appDetails: {
          'app-one': [{ tenant: 'demo' }, { tenant: 'customer1' }],
          'app-two': [{ tenant: 'demo' }, { tenant: 'customer1' }]
        }
      });
      const result = await flyDeployment(config, true);

      // Each project should be deployed once for each tenant
      expect(getMockFly().deploy).toHaveBeenCalledTimes(4); // 2 projects * 2 tenants

      // app-one for demo tenant
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-demo',
          config: '/apps/app-one/fly.toml',
          env: {
            APP_NAME: 'app-one-config-demo',
            FLY_URL: 'https://app-one-config-demo.fly.dev',
            PR_NUMBER: '',
            TENANT_ID: 'demo'
          },
          environment: 'production'
        })
      );

      // app-one for customer1 tenant
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-customer1',
          config: '/apps/app-one/fly.toml',
          env: {
            APP_NAME: 'app-one-config-customer1',
            FLY_URL: 'https://app-one-config-customer1.fly.dev',
            PR_NUMBER: '',
            TENANT_ID: 'customer1'
          },
          environment: 'production'
        })
      );

      // app-two for demo tenant
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-demo',
          config: '/apps/app-two/fly.production.toml',
          env: {
            APP_NAME: 'app-two-config-demo',
            FLY_URL: 'https://app-two-config-demo.fly.dev',
            PR_NUMBER: '',
            TENANT_ID: 'demo'
          },
          environment: 'production'
        })
      );

      // app-two for customer1 tenant
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config-customer1',
          config: '/apps/app-two/fly.production.toml',
          env: {
            APP_NAME: 'app-two-config-customer1',
            FLY_URL: 'https://app-two-config-customer1.fly.dev',
            PR_NUMBER: '',
            TENANT_ID: 'customer1'
          },
          environment: 'production'
        })
      );

      expect(result).toEqual({
        environment: 'production',
        projects: [
          {
            action: 'deploy',
            app: 'app-one-config-demo',
            name: 'app-one (demo)',
            projectName: 'app-one',
            url: 'https://app-one-config-demo.fly.dev'
          },
          {
            action: 'deploy',
            app: 'app-one-config-customer1',
            name: 'app-one (customer1)',
            projectName: 'app-one',
            url: 'https://app-one-config-customer1.fly.dev'
          },
          {
            action: 'deploy',
            app: 'app-two-config-demo',
            name: 'app-two (demo)',
            projectName: 'app-two',
            url: 'https://app-two-config-demo.fly.dev'
          },
          {
            action: 'deploy',
            app: 'app-two-config-customer1',
            name: 'app-two (customer1)',
            projectName: 'app-two',
            url: 'https://app-two-config-customer1.fly.dev'
          }
        ]
      } satisfies ActionOutputs);
    });

    it('should deploy the host before its tenants, without TENANT_ID', async () => {
      setContext('push-main-branch');
      setupMocks();

      const config = setupTest({
        apps: [
          {
            name: 'cms',
            flyConfigFile: '/apps/app-one/fly.toml',
            githubConfig: {},
            version: '1.0.0',
            previousVersion: '0.9.0'
          }
        ],
        appDetails: { cms: [{ tenant: 'demo' }, {}] }
      });
      const result = await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledTimes(2);

      // Host deployment uses the base app name and has no TENANT_ID
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          config: '/apps/app-one/fly.toml',
          env: {
            APP_NAME: 'app-one-config',
            FLY_URL: 'https://app-one-config.fly.dev',
            PR_NUMBER: ''
          },
          environment: 'production'
        })
      );

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-demo',
          env: expect.objectContaining({ TENANT_ID: 'demo' })
        })
      );

      // Host first, even though the tenant was listed first
      expect(result.projects.map((p) => p.app)).toEqual([
        'app-one-config',
        'app-one-config-demo'
      ]);
    });

    it('should skip tenants when the host deployment failed', async () => {
      setContext('push-main-branch');
      setupMocks();
      const deploy = vi.fn().mockRejectedValue(new Error('host boom'));
      const base = mockFly.getMockImplementation() as () => Fly;
      mockFly.mockImplementation(function () {
        return { ...base(), deploy } as unknown as Fly;
      });

      const config = setupTest({
        apps: [getDefaultApps()[0]],
        appDetails: { 'app-one': [{ tenant: 'demo' }, {}] }
      });
      await flyDeployment(config, true).catch(() => undefined);

      expect(deploy).toHaveBeenCalledTimes(1);
      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config' })
      );
      expect(mockCoreWarning).toHaveBeenCalledWith(
        expect.stringContaining('host deployment')
      );
    });

    it('should deploy a host-only app once under the base name without TENANT_ID', async () => {
      setContext('push-main-branch');
      setupMocks();

      const config = setupTest({
        apps: [getDefaultApps()[0]],
        appDetails: { 'app-one': [{}] }
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledTimes(1);
      const call = vi.mocked(getMockFly().deploy).mock.calls[0][0];
      expect(call.app).toBe('app-one-config');
      expect(call.env).not.toHaveProperty('TENANT_ID');
    });

    it.each([
      ['is missing from appDetails', {}],
      ['has no deployments', { 'app-two': [] }]
    ])(
      'should skip an app that %s and still deploy the others',
      async (_label, appDetails) => {
        setContext('push-main-branch');
        setupMocks();

        const config = setupTest({
          appDetails: { 'app-one': [{}], ...appDetails }
        });
        const result = await flyDeployment(config, true);

        expect(getMockFly().deploy).toHaveBeenCalledTimes(1);
        expect(getMockFly().deploy).toHaveBeenCalledWith(
          expect.objectContaining({ app: 'app-one-config' })
        );
        expect(result.projects.map((p) => p.projectName)).toEqual(['app-one']);
        expect(mockCoreWarning).toHaveBeenCalledWith(
          expect.stringContaining('Skipping app-two')
        );
      }
    );
  });

  describe('workflow_dispatch event', () => {
    it('should deploy using environment input for production', async () => {
      setContext('push-main-branch', {
        eventName: 'workflow_dispatch',
        payload: { ref: 'refs/heads/main' }
      });
      setupMocks();
      const config = setupTest({ environment: 'production' });
      const result = await flyDeployment(config, true);

      expect(mockCoreInfo).toHaveBeenCalledWith(
        `Using environment 'production'`
      );
      expect(result.environment).toBe('production');
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production'
        })
      );
    });

    it('should deploy using environment input for preview', async () => {
      setContext('pr-opened', {
        eventName: 'workflow_dispatch',
        payload: { number: 1, state: 'open' }
      });
      setupMocks();
      const config = setupTest({ environment: 'preview' });
      const result = await flyDeployment(config, true);

      expect(result.environment).toBe('preview');
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'preview'
        })
      );
    });

    // A real workflow_dispatch payload carries no pull request
    it('should deploy to preview using the prNumber input when the payload has none', async () => {
      setContext('push-main-branch', {
        eventName: 'workflow_dispatch',
        payload: { ref: 'refs/heads/main' }
      });
      setupMocks();
      const config = setupTest(
        { environment: 'preview', prNumber: 42 },
        'preview'
      );
      const result = await flyDeployment(config, true);

      expect(result.environment).toBe('preview');
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'preview',
          env: expect.objectContaining({ PR_NUMBER: '42' })
        })
      );
    });

    it('should fail preview deployment when no pull request can be resolved', async () => {
      setContext('push-main-branch', {
        eventName: 'workflow_dispatch',
        payload: { ref: 'refs/heads/main' }
      });
      setupMocks();
      const config = setupTest({ environment: 'preview' }, 'preview');

      await expect(flyDeployment(config, true)).rejects.toThrow(
        /pull request number is required for preview deployments/i
      );
    });

    it('should let the prNumber input take precedence over the payload', async () => {
      setContext('pr-opened', {
        eventName: 'workflow_dispatch',
        payload: { number: 1, state: 'open' }
      });
      setupMocks();
      const config = setupTest(
        { environment: 'preview', prNumber: 99 },
        'preview'
      );
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ PR_NUMBER: '99' })
        })
      );
    });
  });

  describe('workflow_run event', () => {
    it('should deploy to preview using PR number from workflow_run pull_requests', async () => {
      setContext('push-main-branch', {
        eventName: 'workflow_run',
        payload: {
          workflow_run: {
            event: 'pull_request',
            pull_requests: [{ number: 42 }]
          }
        }
      });
      setupMocks();
      const config = setupTest({}, 'preview');
      const result = await flyDeployment(config, true);

      expect(result.environment).toBe('preview');
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-pr-42',
          environment: 'preview'
        })
      );
    });

    it('should deploy to production when workflow_run is triggered by a push event', async () => {
      setContext('push-main-branch', {
        eventName: 'workflow_run',
        payload: {
          workflow_run: {
            event: 'push',
            pull_requests: []
          }
        }
      });
      setupMocks();
      const config = setupTest({ environment: 'production' });
      const result = await flyDeployment(config, true);

      expect(result.environment).toBe('production');
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          environment: 'production'
        })
      );
    });
  });

  describe('deploy with pre-built images', () => {
    it('should deploy using pre-built image when images input is provided', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        images: {
          'app-one': 'registry.fly.io/app-one-config:deployment-abc123',
          'app-two': 'registry.fly.io/app-two-config:deployment-abc123'
        }
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          image: 'registry.fly.io/app-one-config:deployment-abc123'
        })
      );
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-two-config',
          image: 'registry.fly.io/app-two-config:deployment-abc123'
        })
      );
    });

    it('should still pass env and secrets when deploying with pre-built image', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        env: ['INFISICAL_SITE=https://app.infisical.com'],
        secrets: ['INFISICAL_CLIENT_ID=client-id'],
        images: {
          'app-one': 'registry.fly.io/app-one-config:deployment-abc123',
          'app-two': 'registry.fly.io/app-two-config:deployment-abc123'
        }
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config',
          env: expect.objectContaining({
            INFISICAL_SITE: 'https://app.infisical.com'
          }),
          secrets: {
            INFISICAL_CLIENT_ID: 'client-id'
          }
        })
      );
    });

    it('should use the same pre-built image for all tenant deployments of an app', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        appDetails: {
          'app-one': [{ tenant: 'demo' }, { tenant: 'customer1' }]
        },
        images: {
          'app-one': 'registry.fly.io/app-one-config:deployment-abc123',
          'app-two': 'registry.fly.io/app-two-config:deployment-abc123'
        }
      });
      await flyDeployment(config, true);

      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-demo',
          image: 'registry.fly.io/app-one-config:deployment-abc123'
        })
      );
      expect(getMockFly().deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'app-one-config-customer1',
          image: 'registry.fly.io/app-one-config:deployment-abc123'
        })
      );
    });

    it('should not call fly.build() when deploying with pre-built images', async () => {
      setContext('push-main-branch');
      setupMocks();
      const config = setupTest({
        images: {
          'app-one': 'registry.fly.io/app-one-config:deployment-abc123',
          'app-two': 'registry.fly.io/app-two-config:deployment-abc123'
        }
      });
      await flyDeployment(config, true);

      expect(getMockFly().build).not.toHaveBeenCalled();
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
      try {
        await flyDeployment(config);
      } catch {
        // Expected to throw by default
      }

      expect(core.setFailed).toHaveBeenCalledWith('error message');
    });

    it('should return empty properties when throwOnError is false', async () => {
      const config = setupTest();
      const result = await flyDeployment(config, false);

      expect(result).toEqual({
        environment: null,
        projects: []
      });
    });

    it('should passthrough exceptions by default', async () => {
      const config = setupTest();

      let error;
      let result;

      try {
        result = await flyDeployment(config);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);
      expect(result).toBeUndefined();
    });

    it('should not passthrough exceptions when explicitly disabled', async () => {
      const config = setupTest();

      expect(async () => await flyDeployment(config, false)).not.toThrow();
    });
  });
});
