import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as coreActions from '@codeware/shared/util/github';
import * as devkit from '@nx/devkit';
import replaceInFile from 'replace-in-file';

import * as nxMigrateImport from './nx-migrate';
import * as addPullRequestAssignees from './utils/add-pull-request-assignees';
import * as addPullRequestLabel from './utils/add-pull-request-label';
import * as cleanupPullRequests from './utils/cleanup-pull-requests';
import * as createPullRequest from './utils/create-pull-request';
import * as enablePullRequestAutoMerge from './utils/enable-pull-request-auto-merge';
import * as getNxVersionInfo from './utils/get-nx-version-info';
import * as readDeferredPrompts from './utils/read-deferred-prompts';
import * as runNxE2e from './utils/run-nx-e2e';
import * as runNxTests from './utils/run-nx-tests';
import type { ActionInputs } from './utils/types';

// Mock strategy:
// - Wrap every module/function with `vi.mock` to mock away the real implementation
// - Create a mock function using `vi.spyOn` for those functions that needs to be interacted with

vi.mock('@actions/core');
vi.mock('@actions/exec');
// Root Vitest mock of the Octokit client
vi.mock(
  '@actions/github',
  // eslint-disable-next-line @nx/enforce-module-boundaries
  () => import('../../../../__mocks__/@actions/github')
);
vi.mock('@nx/devkit');
vi.mock('replace-in-file', () => ({ default: vi.fn() }));

describe('nxMigrate', () => {
  const infoMock = vi.spyOn(core, 'info');
  const execMock = vi.spyOn(exec, 'exec');
  const getExecOutputMock = vi.spyOn(exec, 'getExecOutput');
  const getPackageManagerCommandMock = vi.spyOn(
    devkit,
    'getPackageManagerCommand'
  );
  const replaceInFileMock = vi.mocked(replaceInFile);

  const addPullRequestAssigneesMock = vi.spyOn(
    addPullRequestAssignees,
    'addPullRequestAssignees'
  );
  const addPullRequestCommentMock = vi.spyOn(
    coreActions,
    'addPullRequestComment'
  );
  const addPullRequestLabelMock = vi.spyOn(
    addPullRequestLabel,
    'addPullRequestLabel'
  );
  const cleanupPullRequestsMock = vi.spyOn(
    cleanupPullRequests,
    'cleanupPullRequests'
  );
  const createPullRequestMock = vi.spyOn(
    createPullRequest,
    'createPullRequest'
  );
  const enablePullRequestAutoMergeMock = vi.spyOn(
    enablePullRequestAutoMerge,
    'enablePullRequestAutoMerge'
  );
  const getNxVersionInfoMock = vi.spyOn(getNxVersionInfo, 'getNxVersionInfo');
  const readDeferredPromptsMock = vi.spyOn(
    readDeferredPrompts,
    'readDeferredPrompts'
  );
  const runNxTestsMock = vi.spyOn(runNxTests, 'runNxTests');
  const runNxE2eMock = vi.spyOn(runNxE2e, 'runNxE2e');

  const nxMigrateMock = vi.spyOn(nxMigrateImport, 'nxMigrate');
  const nxMigrate = nxMigrateImport.nxMigrate;

  /**
   * Setup test with default mock of `getNxVersionInfo`
   *
   * @param mode Nx version status mode
   * @param configOverride Additional config overrides
   * @returns Action inputs required values with optional overrides
   */
  const setupTest = (
    mode: 'up-to-date' | 'major-update' | 'minor-update' | 'patch-update',
    configOverride?: Partial<ActionInputs>
  ): ActionInputs => {
    switch (mode) {
      case 'up-to-date':
        getNxVersionInfoMock.mockResolvedValue({
          currentVersion: '1.0.0',
          latestVersion: '1.0.0',
          updateType: 'none'
        });
        break;
      case 'major-update':
        getNxVersionInfoMock.mockResolvedValue({
          currentVersion: '1.0.0',
          latestVersion: '2.0.0',
          updateType: 'major'
        });
        break;
      case 'minor-update':
        getNxVersionInfoMock.mockResolvedValue({
          currentVersion: '1.0.0',
          latestVersion: '1.1.0',
          updateType: 'minor'
        });
        break;
      case 'patch-update':
        getNxVersionInfoMock.mockResolvedValue({
          currentVersion: '1.0.0',
          latestVersion: '1.0.1',
          updateType: 'patch'
        });
        break;
    }

    return {
      ...{
        token: 'token',
        autoMerge: false,
        checkToken: false,
        committer: '',
        author: '',
        mainBranch: '',
        frequency: 'patch',
        packagePatterns: [],
        prAssignees: '',
        skipTests: false,
        skipE2E: false,
        dryRun: false
      },
      ...configOverride
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock default responses
    execMock.mockResolvedValue(0);
    getExecOutputMock.mockImplementation((cmd, args) => {
      if (args?.includes('ls-remote')) {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      return Promise.resolve({ stdout: 'whatever', stderr: '', exitCode: 0 });
    });
    getPackageManagerCommandMock.mockReturnValue({
      exec: 'npx',
      install: 'npm install --no-immutable'
    } as never);
    readDeferredPromptsMock.mockReturnValue([]);
    replaceInFileMock.mockResolvedValue([] as never);
    runNxE2eMock.mockResolvedValue(true);
    runNxTestsMock.mockResolvedValue(true);
  });

  describe('start up', () => {
    it('should get valid migrate config from only required inputs', async () => {
      const config = setupTest('up-to-date');

      expect(config).toEqual({
        author: '',
        autoMerge: false,
        checkToken: false,
        committer: '',
        dryRun: false,
        mainBranch: '',
        frequency: 'patch',
        packagePatterns: [],
        prAssignees: '',
        skipTests: false,
        skipE2E: false,
        token: 'token'
      } satisfies ActionInputs);

      await nxMigrate(config, true);
      expect(nxMigrateMock).toHaveReturned();
    });

    it('should set git user from committer configuration', async () => {
      const config = setupTest('up-to-date', {
        committer: 'actor <actor@users.noreply.github.com>'
      });
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', [
        'config',
        'user.name',
        'actor'
      ]);
      expect(execMock).toHaveBeenCalledWith('git', [
        'config',
        'user.email',
        'actor@users.noreply.github.com'
      ]);
    });

    it('should set git user to github actions bot when no committer is provided', async () => {
      const config = setupTest('up-to-date');
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', [
        'config',
        'user.name',
        'github-actions[bot]'
      ]);
      expect(execMock).toHaveBeenCalledWith('git', [
        'config',
        'user.email',
        '41898282+github-actions[bot]@users.noreply.github.com'
      ]);
    });

    it('should set git remote url to use https token authentication', async () => {
      const config = setupTest('up-to-date');
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', [
        'remote',
        'set-url',
        'origin',
        'https://x-access-token:token@github.com/owner/repo.git'
      ]);
    });

    it('should fail migrate when token is missing', async () => {
      const config = setupTest('up-to-date', { token: '' });
      let error;
      try {
        await nxMigrate(config, true);
      } catch (e) {
        error = e;
      }
      expect(error).toContain('token is required');
    });
  });

  describe('migration responses', () => {
    it('should return status when workspace is up to date', async () => {
      const config = setupTest('up-to-date');
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        updateType: 'none',
        isMigrated: false,
        pullRequest: undefined
      });
    });

    it('should return status when workspace is up to date (dry-run)', async () => {
      const config = setupTest('up-to-date', { dryRun: true });
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        updateType: 'none',
        isMigrated: false,
        pullRequest: undefined
      });
    });

    it('should return status when pull request exists', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getExecOutputMock.mockResolvedValue({ stdout: 'remote branch' } as any);
      const config = setupTest('patch-update');
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        updateType: 'patch',
        isMigrated: false,
        pullRequest: 1
      });
    });

    it('should return status when pull request exists (dry-run)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getExecOutputMock.mockResolvedValue({ stdout: 'remote branch' } as any);
      const config = setupTest('patch-update', { dryRun: true });
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        updateType: 'patch',
        isMigrated: false,
        pullRequest: 1
      });
    });

    it('should return status when workspace is minor version outdated', async () => {
      const config = setupTest('minor-update');
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor',
        isMigrated: true,
        pullRequest: 1
      });
    });

    it('should return status when workspace is minor version outdated (dry-run)', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor',
        isMigrated: false,
        pullRequest: undefined
      });
    });

    it('should return status when workspace is major version outdated', async () => {
      const config = setupTest('major-update');
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
        isMigrated: true,
        pullRequest: 1
      });
    });

    it('should return status when workspace is major version outdated (dry-run)', async () => {
      const config = setupTest('major-update', { dryRun: true });
      const result = await nxMigrate(config, true);

      expect(result).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
        isMigrated: false,
        pullRequest: undefined
      });
    });
  });

  describe('frequency-based migration control', () => {
    it('should always proceed with migration when frequency is patch', async () => {
      let config = setupTest('patch-update', { frequency: 'patch' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        updateType: 'patch',
        isMigrated: true,
        pullRequest: 1
      });

      config = setupTest('minor-update', { frequency: 'patch' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor',
        isMigrated: true,
        pullRequest: 1
      });

      config = setupTest('major-update', { frequency: 'patch' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
        isMigrated: true,
        pullRequest: 1
      });
    });

    it('should skip patch migrations when frequency is minor', async () => {
      let config = setupTest('patch-update', { frequency: 'minor' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        updateType: 'patch',
        isMigrated: false,
        pullRequest: undefined
      });

      config = setupTest('minor-update', { frequency: 'minor' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor',
        isMigrated: true,
        pullRequest: 1
      });

      config = setupTest('major-update', { frequency: 'minor' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
        isMigrated: true,
        pullRequest: 1
      });
    });

    it('should skip minor and patch migrations when frequency is major', async () => {
      let config = setupTest('patch-update', { frequency: 'major' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        updateType: 'patch',
        isMigrated: false,
        pullRequest: undefined
      });

      config = setupTest('minor-update', { frequency: 'major' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateType: 'minor',
        isMigrated: false,
        pullRequest: undefined
      });

      config = setupTest('major-update', { frequency: 'major' });
      expect(await nxMigrate(config, true)).toEqual({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
        isMigrated: true,
        pullRequest: 1
      });
    });
  });

  describe('happy migration flows', () => {
    it('should update remote url to use token authentication', async () => {
      const config = setupTest('minor-update', {
        mainBranch: 'main'
      });
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', [
        'remote',
        'set-url',
        'origin',
        'https://x-access-token:token@github.com/owner/repo.git'
      ]);
    });

    it('should create/reset feature branch from latest main commit without tracking', async () => {
      const config = setupTest('minor-update', {
        mainBranch: 'main'
      });
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', [
        'checkout',
        '--no-track',
        '-B',
        'update-nx-workspace-1.1.0',
        'origin/main'
      ]);
    });

    describe('nx migration', () => {
      it('should run nx migrate', async () => {
        const config = setupTest('minor-update');
        await nxMigrate(config, true);

        expect(execMock).toHaveBeenCalledWith('npx', [
          'nx',
          'migrate',
          '1.1.0'
        ]);
      });

      it('should format migrated files', async () => {
        const config = setupTest('minor-update');
        await nxMigrate(config, true);

        expect(execMock).toHaveBeenCalledWith('npx', ['nx', 'format:write']);
      });

      it('should install dependencies and allow lock file update', async () => {
        const config = setupTest('minor-update');
        await nxMigrate(config, true);

        expect(execMock).toHaveBeenCalledWith('npm install --no-immutable');
      });

      it('should run migrations without a redundant install', async () => {
        execMock.mockResolvedValue(0);
        const config = setupTest('minor-update');
        await nxMigrate(config, true);

        expect(execMock).toHaveBeenCalledWith('npx', [
          'nx',
          'migrate',
          '--run-migrations',
          '--if-exists',
          '--skip-install'
        ]);
      });

      it('should stage all changes before running tests', async () => {
        const callOrder: string[] = [];

        execMock.mockImplementation(async (cmd, args) => {
          if (cmd === 'git' && args?.includes('add')) {
            callOrder.push('git add');
          }
          return 0;
        });

        runNxTestsMock.mockImplementation(async () => {
          callOrder.push('runNxTests');
          return true;
        });

        const config = setupTest('minor-update');
        await nxMigrate(config, true);

        expect(callOrder[0]).toEqual('git add');
        expect(callOrder[1]).toEqual('runNxTests');
        expect(execMock).toHaveBeenCalledWith('git', ['add', '.']);
      });

      it.todo('should test replace in file');
    });

    it('should stage changes and create and push commit', async () => {
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', ['add', '.']);
      expect(execMock).toHaveBeenCalledWith('git', [
        'commit',
        '--author="actor <1+actor@users.noreply.github.com>"',
        '-m',
        'build(repo): update nx workspace to 1.1.0',
        '--no-verify'
      ]);
      expect(execMock).toHaveBeenCalledWith('git', [
        'push',
        '-u',
        'origin',
        'update-nx-workspace-1.1.0'
      ]);
    });

    it('should call run nx tests function when not skipped', async () => {
      const config = setupTest('minor-update', {
        skipTests: false
      });
      await nxMigrate(config, true);

      expect(runNxTestsMock).toHaveBeenCalled();
    });

    it('should not call run nx tests function when skipped', async () => {
      const config = setupTest('minor-update', {
        skipTests: true
      });
      await nxMigrate(config, true);

      expect(runNxTestsMock).not.toHaveBeenCalled();
    });

    it('should call run nx e2e function when nx tests pass', async () => {
      runNxTestsMock.mockResolvedValue(true);
      const config = setupTest('minor-update', {
        skipTests: false
      });
      await nxMigrate(config, true);

      expect(runNxE2eMock).toHaveBeenCalled();
    });

    it('should call run nx e2e function when nx tests skipped', async () => {
      const config = setupTest('minor-update', {
        skipTests: true
      });
      await nxMigrate(config, true);

      expect(runNxE2eMock).toHaveBeenCalled();
    });

    it('should not call run nx e2e function when nx e2e skipped', async () => {
      const config = setupTest('minor-update', {
        skipE2E: true
      });
      await nxMigrate(config, true);

      expect(runNxE2eMock).not.toHaveBeenCalled();
    });

    it('should not call run nx e2e function when nx tests ran successfully but e2e skipped', async () => {
      runNxTestsMock.mockResolvedValue(true);
      const config = setupTest('minor-update', {
        skipTests: false,
        skipE2E: true
      });
      await nxMigrate(config, true);

      expect(runNxE2eMock).not.toHaveBeenCalled();
    });

    it('should not call run nx e2e function when nx tests fail', async () => {
      runNxTestsMock.mockResolvedValue(false);
      const config = setupTest('minor-update', {
        skipTests: false
      });
      await nxMigrate(config, true);

      expect(runNxE2eMock).not.toHaveBeenCalled();
    });

    it('should discard unstaged changes', async () => {
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(execMock).toHaveBeenCalledWith('git', ['checkout', '--', '.']);
    });

    it('should call create pull request function', async () => {
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(createPullRequestMock).toHaveBeenCalledWith(
        expect.any(Object),
        { currentVersion: '1.0.0', latestVersion: '1.1.0' },
        {
          deferredPrompts: [],
          e2ePass: true,
          testsPass: true
        }
      );
    });

    it('should call add pull request labels function', async () => {
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(addPullRequestLabelMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token' }),
        1
      );
    });

    it('should call add pull request assignees function', async () => {
      const config = setupTest('minor-update', {
        prAssignees: 'user1,user2'
      });
      await nxMigrate(config, true);

      expect(addPullRequestAssigneesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prAssignees: ['user1', 'user2'],
          token: 'token'
        }),
        1
      );
    });

    it('should not call add pull request assignees function when no assignees are provided', async () => {
      const config = setupTest('minor-update', {
        prAssignees: ''
      });
      await nxMigrate(config, true);

      expect(addPullRequestAssigneesMock).not.toHaveBeenCalled();
    });

    it('should call enable pull request auto merge function when enabled', async () => {
      const config = setupTest('minor-update', {
        autoMerge: true
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).toHaveBeenCalledWith(
        'token',
        1,
        'REBASE'
      );
    });

    it('should not call enable pull request auto merge function when disabled', async () => {
      const config = setupTest('minor-update', {
        autoMerge: false
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
    });

    it('should not call enable pull request auto merge function for major version update', async () => {
      const config = setupTest('major-update', {
        autoMerge: true
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
      expect(addPullRequestCommentMock).toHaveBeenCalledWith(
        'token',
        1,
        'Auto-merge is disabled for major version migrations'
      );
    });

    it('should not call enable pull request auto merge function when prompt migrations were deferred', async () => {
      readDeferredPromptsMock.mockReturnValue([
        { name: '1-1-0-do-thing', prompt: 'tools/ai-migrations/do.md' }
      ]);
      const config = setupTest('minor-update', {
        autoMerge: true
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
      expect(addPullRequestCommentMock).toHaveBeenCalledWith(
        'token',
        1,
        'Auto-merge was disabled since some prompt migrations must be applied manually'
      );
    });

    it('should not call enable pull request auto merge function when nx tests failed', async () => {
      runNxTestsMock.mockResolvedValue(false);
      const config = setupTest('minor-update', {
        autoMerge: true
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
      expect(addPullRequestCommentMock).toHaveBeenCalledWith(
        'token',
        1,
        'Auto-merge was disabled since some tests failed'
      );
    });

    it('should not call enable pull request auto merge function when nx e2e failed', async () => {
      runNxE2eMock.mockResolvedValue(false);
      const config = setupTest('minor-update', {
        autoMerge: true
      });
      await nxMigrate(config, true);

      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
      expect(addPullRequestCommentMock).toHaveBeenCalledWith(
        'token',
        1,
        'Auto-merge was disabled since some tests failed'
      );
    });

    it('should call cleanup pull requests function', async () => {
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(cleanupPullRequestsMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token' }),
        1
      );
    });
  });

  describe('skip migration', () => {
    it('should return early when workspace is up to date', async () => {
      const config = setupTest('up-to-date');
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['fetch'])
      );
      expect(execMock).not.toHaveBeenCalledWith('npx', [
        'nx',
        expect.anything()
      ]);
    });

    it('should return early when pull request and branch exists', async () => {
      getExecOutputMock.mockImplementation((cmd, args) => {
        if (args?.includes('ls-remote')) {
          return Promise.resolve({
            stdout: 'remote branch',
            stderr: '',
            exitCode: 0
          });
        }
        return Promise.resolve({ stdout: 'whatever', stderr: '', exitCode: 0 });
      });
      const config = setupTest('minor-update');
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['fetch'])
      );
      expect(execMock).not.toHaveBeenCalledWith('npx', [
        'nx',
        expect.anything()
      ]);
    });
  });

  describe('dry-run', () => {
    it('should skip creating local branch ', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['checkout'])
      );
    });

    it('should skip nx migrate and post changes', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['nx'])
      );
      expect(execMock).not.toHaveBeenCalledWith(
        expect.arrayContaining(['install'])
      );
      expect(execMock).not.toHaveBeenCalledWith('test', expect.any(Array));
      expect(replaceInFile).not.toHaveBeenCalled();
    });

    it('should not commit', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['commit'])
      );
    });

    it('should not discard changes', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(execMock).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['checkout'])
      );
    });

    it('should skip running tests', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(runNxTestsMock).not.toHaveBeenCalled();
      expect(runNxE2eMock).not.toHaveBeenCalled();
    });

    it('should skip pull request', async () => {
      const config = setupTest('minor-update', { dryRun: true });
      await nxMigrate(config, true);

      expect(createPullRequestMock).not.toHaveBeenCalled();
      expect(addPullRequestLabelMock).not.toHaveBeenCalled();
      expect(addPullRequestAssigneesMock).not.toHaveBeenCalled();
      expect(enablePullRequestAutoMergeMock).not.toHaveBeenCalled();
      expect(cleanupPullRequestsMock).not.toHaveBeenCalled();
    });

    it(`should print 'skip' log`, async () => {
      const config = setupTest('minor-update', {
        dryRun: true
      });
      await nxMigrate(config, true);

      expect(core.info).toHaveBeenCalledWith('Skip nx migration [dry-run]');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Mock error response for a function called early in the flow
      infoMock.mockImplementation(() => {
        throw new Error('error message');
      });
    });

    it('should set failed error message', async () => {
      const config = setupTest('up-to-date');
      await nxMigrate(config);

      expect(core.setFailed).toHaveBeenCalledWith('error message');
    });

    it('should return empty object', async () => {
      const config = setupTest('up-to-date');
      const result = await nxMigrate(config);

      expect(result).toEqual({});
    });

    it('should not passthough exceptions by default', async () => {
      const config = setupTest('up-to-date');

      await nxMigrate(config);
      expect(nxMigrateMock).toHaveReturned();
    });

    it('should passthough exceptions', async () => {
      const config = setupTest('up-to-date');

      let error;
      let result;

      try {
        result = await nxMigrate(config, true);
      } catch (e) {
        error = e;
      }

      expect(error).toBe('error message');
      expect(result).toBeUndefined();
    });
  });
});
