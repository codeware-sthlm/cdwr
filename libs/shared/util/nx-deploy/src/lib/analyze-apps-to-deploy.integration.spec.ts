import * as exec from '@actions/exec';
import { vol } from 'memfs';

import { analyzeAppsToDeploy } from './analyze-apps-to-deploy';
import { type AppRelease, getAppsToRelease } from './get-apps-to-release';
import { resolveRanges } from './resolve-ranges';

/**
 * Integration tests for `analyzeAppsToDeploy` function.
 *
 * These tests verify the real behavior of analyzeAppsToDeploy without mocking
 * its internal dependencies (getNxProject, file system operations).
 * This ensures the complete workflow from Nx workspace queries to deployment
 * decisions works correctly.
 */

// Mock the file system to create a controlled test environment
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

// Mock exec for Nx CLI commands
vi.mock('@actions/exec');

// Mock the release resolver — it drives `nx release` against the real workspace
vi.mock('./get-apps-to-release');

// Git ranges are resolved against a real repository; the diff itself is mocked
// through exec below
vi.mock('./resolve-ranges');

describe('analyzeAppsToDeploy - Integration', () => {
  const mockGetExecOutput = vi.mocked(exec.getExecOutput);
  const mockGetAppsToRelease = vi.mocked(getAppsToRelease);
  const mockResolveRanges = vi.mocked(resolveRanges);

  /** Files `git diff --name-only` reports */
  let changedFiles: string[] = [];
  /** Projects `nx show projects --affected` reports */
  let affectedProjects: string[] = [];

  /**
   * Mock what changed: the files in the range and the projects they affect
   */
  const mockChanges = (files: string[], affected: string[]) => {
    changedFiles = files;
    affectedProjects = affected;
  };

  /**
   * Mock the versions `nx release` resolves for the workspace apps
   */
  const mockReleases = (releases: Record<string, AppRelease>) => {
    mockGetAppsToRelease.mockResolvedValue(new Map(Object.entries(releases)));
  };

  /**
   * Every app the suite references, bumped and ready to release. Tests that care
   * about the bump itself set their own map.
   */
  const allAppsBumped = () =>
    mockReleases(
      Object.fromEntries(
        ['web', 'cms', 'api', 'app-a', 'app-b', 'app-c', 'nested-app'].map(
          (name) => [
            name,
            { version: '1.0.0', previousVersion: '0.9.0', bumped: true }
          ]
        )
      )
    );

  /**
   * Helper to create a mock Nx workspace structure
   */
  const createWorkspace = (
    projects: {
      name: string;
      root: string;
      hasGithubJson?: boolean;
      githubConfig?: Record<string, unknown>;
      hasFlyToml?: boolean;
    }[]
  ) => {
    const files: Record<string, string> = {};

    for (const project of projects) {
      // Create github.json if specified
      if (project.hasGithubJson) {
        const githubConfig = project.githubConfig || {};
        files[`/${project.root}/github.json`] = JSON.stringify(githubConfig);
      }

      // Create fly.toml if specified
      if (project.hasFlyToml) {
        files[`/${project.root}/fly.toml`] = `app = "${project.name}"`;
      }
    }

    vol.fromJSON(files);
  };

  /**
   * Mock getNxProject response for a specific project
   */
  const mockNxProject = (projects: { name: string; root: string }[]) => {
    mockGetExecOutput.mockImplementation(async (command, args) => {
      const argsStr = args?.join(' ') || '';

      // Mock: git diff --name-only <base> <head>
      if (command === 'git' && argsStr.includes('diff --name-only')) {
        return {
          exitCode: 0,
          stdout: changedFiles.join('\n'),
          stderr: ''
        };
      }

      // Mock: nx show projects --affected --files <files> --json
      if (argsStr.includes('show projects')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(affectedProjects),
          stderr: ''
        };
      }

      // Mock: nx show project <name> --json
      if (argsStr.includes('show project')) {
        const projectName = args?.find(
          (arg, idx) => args[idx - 1] === 'project'
        );
        const project = projects.find((p) => p.name === projectName);

        if (project) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              name: project.name,
              root: project.root,
              sourceRoot: `${project.root}/src`
            }),
            stderr: ''
          };
        }
      }

      throw new Error(`Unexpected exec call: ${command} ${argsStr}`);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vol.reset();
    process.cwd = () => '/';
    allAppsBumped();
    // Something changed in every app unless a test says otherwise
    mockChanges(
      ['apps/app/src/main.ts'],
      ['web', 'cms', 'api', 'app-a', 'app-b', 'app-c', 'nested-app']
    );
    mockResolveRanges.mockImplementation(async ({ previousVersions }) => {
      return new Map(
        [...previousVersions.keys()].map((name) => [
          name,
          { base: 'base-sha', head: 'head-sha' }
        ])
      );
    });
  });

  afterEach(() => {
    vol.reset();
  });

  describe('successful deployment scenarios', () => {
    it('should return apps ready for deployment when all conditions are met', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'cms',
          root: 'apps/cms',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);

      mockNxProject([
        { name: 'web', root: 'apps/web' },
        { name: 'cms', root: 'apps/cms' }
      ]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, [
        'web',
        'cms'
      ]);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'deploy',
        flyConfigFile: 'apps/web/fly.toml',
        githubConfig: {}
      });
      expect(result[1]).toMatchObject({
        projectName: 'cms',
        status: 'deploy',
        flyConfigFile: 'apps/cms/fly.toml',
        githubConfig: {}
      });
    });

    it('should handle single app deployment', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'api',
          root: 'apps/api',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);

      mockNxProject([{ name: 'api', root: 'apps/api' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['api']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'api',
        status: 'deploy'
      });
    });

    it('should handle environment-specific fly config', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: false
        }
      ]);

      // Create environment-specific fly config
      vol.fromJSON({
        '/apps/web/fly.production.toml': 'app = "web-prod"'
      });

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy('production', undefined, [
        'web'
      ]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'deploy',
        flyConfigFile: 'apps/web/fly.production.toml'
      });
    });
  });

  describe('runtime change gate', () => {
    const twoApps = () => {
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'cms',
          root: 'apps/cms',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);
      mockNxProject([
        { name: 'web', root: 'apps/web' },
        { name: 'cms', root: 'apps/cms' }
      ]);
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: true },
        cms: { version: '1.3.2', previousVersion: '1.3.1', bumped: true }
      });
    };

    it('should deploy nothing for a docs-only change', async () => {
      twoApps();
      mockChanges(['apps/cms/AGENTS.md', 'docs/guide.mdx'], ['cms']);

      const result = await analyzeAppsToDeploy(undefined);

      expect(result).toEqual([
        {
          projectName: 'web',
          status: 'skip',
          reason:
            'bumped by nx release, but no runtime change in base-sha..head-sha'
        },
        {
          projectName: 'cms',
          status: 'skip',
          reason:
            'bumped by nx release, but no runtime change in base-sha..head-sha'
        }
      ]);
      // Nothing left after filtering, so Nx is never asked
      expect(mockGetExecOutput).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['--affected']),
        expect.anything()
      );
    });

    it('should deploy only the app whose source changed', async () => {
      twoApps();
      mockChanges(['apps/web/src/main.ts'], ['web']);

      const result = await analyzeAppsToDeploy(undefined);

      expect(result).toMatchObject([
        { projectName: 'web', status: 'deploy' },
        { projectName: 'cms', status: 'skip' }
      ]);
    });

    it('should deploy both apps when a shared lib changed', async () => {
      twoApps();
      mockChanges(['libs/shared/src/x.ts'], ['shared', 'web', 'cms']);

      const result = await analyzeAppsToDeploy(undefined);

      expect(result).toMatchObject([
        { projectName: 'web', status: 'deploy' },
        { projectName: 'cms', status: 'deploy' }
      ]);
    });

    it('should not call git or Nx for an explicit app', async () => {
      twoApps();
      mockChanges(['docs/guide.mdx'], []);

      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      expect(result).toMatchObject([{ projectName: 'web', status: 'deploy' }]);
      expect(mockResolveRanges).not.toHaveBeenCalled();
    });

    it('should resolve ranges for the bumped apps in the preview lane', async () => {
      twoApps();
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: true },
        cms: { version: '1.3.2', previousVersion: '1.3.1', bumped: false }
      });

      await analyzeAppsToDeploy(undefined, 'preview.466', undefined, 466);

      expect(mockResolveRanges).toHaveBeenCalledWith({
        preid: 'preview.466',
        prNumber: 466,
        mainBranch: undefined,
        previousVersions: new Map([['web', '1.1.3']])
      });
    });
  });

  describe('release-driven selection', () => {
    const twoApps = () => {
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'cms',
          root: 'apps/cms',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);
      mockNxProject([
        { name: 'web', root: 'apps/web' },
        { name: 'cms', root: 'apps/cms' }
      ]);
    };

    it('should deploy only the apps that were bumped', async () => {
      twoApps();
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: true },
        cms: { version: '1.3.2', previousVersion: '1.3.1', bumped: false }
      });

      const result = await analyzeAppsToDeploy(undefined);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ projectName: 'web', status: 'deploy' });
    });

    it('should carry the resolved version onto each app', async () => {
      twoApps();
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: true },
        cms: { version: '1.3.2', previousVersion: '1.3.1', bumped: true }
      });

      const result = await analyzeAppsToDeploy(undefined);

      expect(result).toMatchObject([
        { projectName: 'web', version: '1.1.4' },
        { projectName: 'cms', version: '1.3.2' }
      ]);
    });

    it('should stamp the last released version on a forced unbumped app', async () => {
      twoApps();
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: false },
        cms: { version: '1.3.2', previousVersion: '1.3.1', bumped: false }
      });

      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      expect(result).toMatchObject([
        { projectName: 'web', status: 'deploy', version: '1.1.4' }
      ]);
    });

    it('should resolve versions within the preview lane', async () => {
      twoApps();
      mockReleases({
        web: {
          version: '1.1.4-preview.466.0',
          previousVersion: '1.1.3',
          bumped: true
        }
      });

      const result = await analyzeAppsToDeploy(undefined, 'preview.466');

      expect(mockGetAppsToRelease).toHaveBeenCalledWith('preview.466');
      expect(result).toMatchObject([
        { projectName: 'web', version: '1.1.4-preview.466.0' }
      ]);
    });

    it('should skip a forced app outside the release group', async () => {
      twoApps();
      mockReleases({
        web: { version: '1.1.4', previousVersion: '1.1.3', bumped: true }
      });

      const result = await analyzeAppsToDeploy(undefined, undefined, ['cms']);

      expect(result).toMatchObject([
        {
          projectName: 'cms',
          status: 'skip',
          reason: 'Not a member of the `apps` release group'
        }
      ]);
    });
  });

  describe('skip scenarios - missing configuration', () => {
    it('should skip app when github.json is missing', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: false,
          hasFlyToml: true
        }
      ]);

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'skip',
        reason: 'github.json not found in app root'
      });
    });

    it('should skip app when fly config file is missing', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: false
        }
      ]);

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'skip',
        reason: 'No Fly configuration found in app root'
      });
    });

    it('should skip app when Nx project config not found', async () => {
      // Arrange
      mockGetExecOutput.mockImplementation(async (command, args) => {
        const argsStr = args?.join(' ') || '';

        // Mock: nx show project fails (mismatched name)
        if (argsStr.includes('show project')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              name: 'wrong-name',
              root: 'apps/nonexistent'
            }),
            stderr: ''
          };
        }

        throw new Error(`Unexpected exec call: ${command} ${argsStr}`);
      });

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, [
        'nonexistent'
      ]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'nonexistent',
        status: 'skip',
        reason: 'Nx project configuration not found'
      });
    });
  });

  describe('skip scenarios - configuration validation', () => {
    it('should skip app when fly config files are missing', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: false
        }
      ]);

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'skip',
        reason: 'No Fly configuration found in app root'
      });
    });

    it('should skip app when github.json has invalid schema', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {
            flyPostgresProduction: 'invalid!@#$%' // Invalid pattern
          },
          hasFlyToml: true
        }
      ]);

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('skip');
      if (result[0].status === 'skip') {
        expect(result[0].reason).toContain('Invalid github.json');
      }
    });

    it('should handle github.json with malformed JSON', async () => {
      // Arrange
      vol.fromJSON({
        '/apps/web/github.json': '{ invalid json }'
      });

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act & Assert
      await expect(
        analyzeAppsToDeploy(undefined, undefined, ['web'])
      ).rejects.toThrow();
    });
  });

  describe('mixed scenarios', () => {
    it('should return mixed results when some apps deploy and some skip', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'cms',
          root: 'apps/cms',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: false // Missing fly config
        },
        {
          name: 'api',
          root: 'apps/api',
          hasGithubJson: false,
          hasFlyToml: true
        }
      ]);

      mockNxProject([
        { name: 'web', root: 'apps/web' },
        { name: 'cms', root: 'apps/cms' },
        { name: 'api', root: 'apps/api' }
      ]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, [
        'web',
        'cms',
        'api'
      ]);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'deploy'
      });
      expect(result[1]).toMatchObject({
        projectName: 'cms',
        status: 'skip',
        reason: 'No Fly configuration found in app root'
      });
      expect(result[2]).toMatchObject({
        projectName: 'api',
        status: 'skip',
        reason: 'github.json not found in app root'
      });
    });

    it('should return empty array when no apps are provided', async () => {
      const result = await analyzeAppsToDeploy(undefined, undefined, []);
      expect(result).toEqual([]);
    });

    it('should return empty array when nothing was bumped', async () => {
      mockReleases({
        web: { version: '1.0.0', previousVersion: '1.0.0', bumped: false }
      });
      const result = await analyzeAppsToDeploy(undefined);
      expect(result).toEqual([]);
    });

    it('should process apps in order', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'app-a',
          root: 'apps/app-a',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'app-b',
          root: 'apps/app-b',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        },
        {
          name: 'app-c',
          root: 'apps/app-c',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);

      mockNxProject([
        { name: 'app-a', root: 'apps/app-a' },
        { name: 'app-b', root: 'apps/app-b' },
        { name: 'app-c', root: 'apps/app-c' }
      ]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, [
        'app-a',
        'app-b',
        'app-c'
      ]);

      // Assert
      expect(result.map((r) => r.projectName)).toEqual([
        'app-a',
        'app-b',
        'app-c'
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle nested project directories', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'nested-app',
          root: 'apps/nested/deep/app',
          hasGithubJson: true,
          githubConfig: {},
          hasFlyToml: true
        }
      ]);

      mockNxProject([{ name: 'nested-app', root: 'apps/nested/deep/app' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, [
        'nested-app'
      ]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'nested-app',
        status: 'deploy',
        flyConfigFile: 'apps/nested/deep/app/fly.toml'
      });
    });

    it('should handle github.json with extra properties', async () => {
      // Arrange
      createWorkspace([
        {
          name: 'web',
          root: 'apps/web',
          hasGithubJson: true,
          githubConfig: {
            extraProperty: 'value',
            anotherExtra: { nested: 'object' }
          },
          hasFlyToml: true
        }
      ]);

      mockNxProject([{ name: 'web', root: 'apps/web' }]);

      // Act
      const result = await analyzeAppsToDeploy(undefined, undefined, ['web']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectName: 'web',
        status: 'deploy'
      });
    });
  });
});
