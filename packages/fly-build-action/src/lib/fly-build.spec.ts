import * as core from '@actions/core';
import * as github from '@actions/github';
import type { context } from '@actions/github';
import { Fly } from '@cdwr/fly-node';
import * as coreAction from '@codeware/shared/util/github';
import type { PullRequestEvent } from '@octokit/webhooks-types';

import { flyBuild } from './fly-build';
import type { ActionInputs } from './schemas/action-inputs.schema';

type WebhookPayload = (typeof context)['payload'];

// Mock strategy mirrors `fly-deployment-action`
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
  getRepositoryDefaultBranch: vi.fn(),
  printGitHubContext: vi.fn()
}));
vi.mock('@cdwr/fly-node');

describe('flyBuild', () => {
  // Static mock values
  vi.mocked(coreAction.getRepositoryDefaultBranch).mockResolvedValue('main');

  const mockGithubContext = vi.mocked(github.context);
  const mockFly = vi.mocked(Fly);

  /**
   * Helper to get the mocked Fly instance to interact and spy on methods
   */
  const getMockFly = () =>
    mockFly.mock.results[0].value as typeof Fly.prototype;

  /** `ref` defaults to main so push events resolve `production` */
  const setContext = (
    eventName: string,
    payload: WebhookPayload = {},
    ref = 'refs/heads/main'
  ) => {
    mockGithubContext.eventName = eventName;
    mockGithubContext.payload = payload;
    mockGithubContext.ref = ref;
    mockGithubContext.repo = { owner: 'owner', repo: 'repo' };
  };

  /** `config.show` maps `/apps/app-one/fly.toml` to app name `app-one-config` */
  const setupMocks = () => {
    mockFly.mockImplementation(function () {
      return {
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
              app: config.replace(/\/apps\/([^/]+)\/.*/, '$1-config')
            })
          )
        },
        isReady: vi.fn()
      } as unknown as Fly;
    });
  };

  /** Deployable app fixture */
  const app = (name: string) => ({
    name,
    flyConfigFile: `/apps/${name}/fly.toml`,
    githubConfig: {},
    version: '1.0.0',
    previousVersion: '0.9.0'
  });

  const setupTest = (configOverride?: Partial<ActionInputs>): ActionInputs => ({
    apps: [app('app-one')],
    appDetails: { 'app-one': [{}], 'app-two': [{}] },
    buildArgs: [],
    flyApiToken: 'fly-api-token',
    flyOrg: 'fly-org',
    flyTraceCli: false,
    flyConsoleLogs: false,
    mainBranch: 'main',
    optOutDepotBuilder: false,
    token: 'token',
    ...configOverride
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('environment resolution', () => {
    it('should use the environment input as a manual override', async () => {
      setContext('workflow_dispatch');
      const result = await flyBuild(setupTest({ environment: 'production' }));

      expect(result.environment).toBe('production');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('manual override')
      );
    });

    it('should derive production from a push to the main branch', async () => {
      setContext('push', {}, 'refs/heads/main');
      const result = await flyBuild(setupTest());

      expect(result.environment).toBe('production');
    });

    it('should derive preview from a pull_request event', async () => {
      setContext('pull_request', { number: 7 } as PullRequestEvent);
      const result = await flyBuild(setupTest());

      expect(result.environment).toBe('preview');
    });

    it('should throw when the event resolves to no environment', async () => {
      setContext('push', {}, 'refs/heads/some-feature');

      await expect(flyBuild(setupTest())).rejects.toThrow(
        /not supported for production deployment/
      );
    });
  });

  describe('pull request resolution', () => {
    it('should take the number from a pull_request payload', async () => {
      setContext('pull_request', { number: 7 } as PullRequestEvent);
      await flyBuild(setupTest());

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-pr-7' })
      );
    });

    // workflow_run is the primary trigger but the event switch never handled it
    it('should use the prNumber input for a workflow_run event', async () => {
      setContext('workflow_run', { workflow_run: { event: 'pull_request' } });
      await flyBuild(setupTest({ environment: 'preview', prNumber: 42 }));

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-pr-42' })
      );
    });

    it('should use the prNumber input for a manual dispatch', async () => {
      setContext('workflow_dispatch');
      await flyBuild(setupTest({ environment: 'preview', prNumber: 42 }));

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-pr-42' })
      );
    });

    it('should let the prNumber input take precedence over the payload', async () => {
      setContext('pull_request', { number: 7 } as PullRequestEvent);
      await flyBuild(setupTest({ prNumber: 99 }));

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-pr-99' })
      );
    });

    it('should fail a preview build when no pull request can be resolved', async () => {
      setContext('workflow_run', { workflow_run: { event: 'pull_request' } });

      await expect(
        flyBuild(setupTest({ environment: 'preview' }))
      ).rejects.toThrow(/pull request number is required for preview builds/i);
    });

    it('should not require a pull request for production', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(setupTest());

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config' })
      );
    });
  });

  describe('image building', () => {
    it('should return a map of project name to image reference', async () => {
      setContext('push', {}, 'refs/heads/main');
      const result = await flyBuild(
        setupTest({
          apps: [app('app-one'), app('app-two')]
        })
      );

      expect(result.images).toEqual({
        'app-one': 'registry.fly.io/app-one-config:deployment-abc123',
        'app-two': 'registry.fly.io/app-two-config:deployment-abc123'
      });
    });

    it('should build a shared image once for a multi-tenant app', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          appDetails: {
            'app-one': [{ tenant: 'acme' }, { tenant: 'globex' }]
          }
        })
      );

      expect(getMockFly().build).toHaveBeenCalledTimes(1);
    });

    // Tenant-only apps build under the first tenant, avoiding a ghost host app
    it('should build a tenant-only app under the first tenant name', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          appDetails: {
            'app-one': [{ tenant: 'acme' }, { tenant: 'globex' }]
          }
        })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-acme' })
      );
    });

    it('should build a host app under the base name when it has a host entry', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          appDetails: {
            'app-one': [{}, { tenant: 'acme' }]
          }
        })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config' })
      );
    });

    it('should build a tenant-only app under the first tenant, whatever the order', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          appDetails: {
            'app-one': [{ tenant: 'acme' }, { tenant: 'zeta' }]
          }
        })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'app-one-config-acme' })
      );
    });

    it('should pass build args through to the Fly build', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({ buildArgs: ['APP_SHA=abc1234', 'APP_BUILD_TIME=now'] })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: { APP_SHA: 'abc1234', APP_BUILD_TIME: 'now' }
        })
      );
    });

    it("should add the app's own Sentry details as build args", async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          apps: [
            {
              ...app('app-one'),
              sentry: {
                project: 'app-one',
                dsn: 'https://one@sentry.io/1',
                release: 'app-one@1.2.3+abc1234'
              }
            }
          ],
          buildArgs: ['SENTRY_ORG=acme']
        })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: {
            SENTRY_ORG: 'acme',
            SENTRY_DSN: 'https://one@sentry.io/1',
            SENTRY_PROJECT: 'app-one',
            SENTRY_RELEASE: 'app-one@1.2.3+abc1234'
          }
        })
      );
    });

    it('should omit the release build arg when it is not resolved yet', async () => {
      setContext('push', {}, 'refs/heads/main');
      await flyBuild(
        setupTest({
          apps: [
            {
              ...app('app-one'),
              sentry: { project: 'app-one', dsn: 'https://one@sentry.io/1' }
            }
          ]
        })
      );

      expect(getMockFly().build).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: {
            SENTRY_DSN: 'https://one@sentry.io/1',
            SENTRY_PROJECT: 'app-one'
          }
        })
      );
    });

    it('should skip an app without a deployment and still build the others', async () => {
      setContext('push', {}, 'refs/heads/main');
      const result = await flyBuild(
        setupTest({
          apps: [app('app-one'), app('app-two'), app('app-three')],
          appDetails: { 'app-two': [{}], 'app-three': [] }
        })
      );

      expect(getMockFly().build).toHaveBeenCalledTimes(1);
      expect(Object.keys(result.images)).toEqual(['app-two']);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Skipping app-one')
      );
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Skipping app-three')
      );
    });

    it('should throw when the fly config cannot be resolved', async () => {
      setContext('push', {}, 'refs/heads/main');
      // Must be a `function` so it can be constructed with `new`
      mockFly.mockImplementation(function () {
        return {
          build: vi.fn(),
          cli: { isInstalled: vi.fn().mockResolvedValue(true) },
          config: { show: vi.fn().mockRejectedValue(new Error('nope')) },
          isReady: vi.fn()
        } as unknown as Fly;
      });

      await expect(flyBuild(setupTest())).rejects.toThrow(
        /Fly config file could not be resolved/
      );
    });
  });
});
