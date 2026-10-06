/**
 * Unit tests for the action's main functionality.
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core';

import * as main from './main';
import * as nxMigrate from './nx-migrate';
import type { ActionInputs, ActionOutputs } from './utils/types';

vi.mock('@actions/core');
vi.mock('./nx-migrate');

describe('main', () => {
  const getBooleanInputMock = vi.spyOn(core, 'getBooleanInput');
  const getInputMock = vi.spyOn(core, 'getInput');
  const getMultilineInputMock = vi.spyOn(core, 'getMultilineInput');
  const setFailedMock = vi.spyOn(core, 'setFailed');
  const setOutputMock = vi.spyOn(core, 'setOutput');

  const runMock = vi.spyOn(main, 'run');
  const nxMigrateMock = vi.spyOn(nxMigrate, 'nxMigrate');

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock values
    getBooleanInputMock.mockImplementation(() => true);
    getInputMock.mockImplementation((name: string) => {
      // Return valid value for frequency enum
      if (name === 'frequency') {
        return 'patch';
      }
      return name;
    });
    getMultilineInputMock.mockImplementation((name: string) => [name]);
  });

  it('should run without exceptions', async () => {
    await main.run();
    expect(runMock).toHaveReturned();
  });

  it('should print inputs debug information', async () => {
    await main.run();
    expect(core.debug).toHaveBeenCalled();
  });

  it('should have valid inputs with all inputs provided truthly', async () => {
    await main.run();

    expect(nxMigrateMock).toHaveBeenCalledWith({
      token: 'token',
      autoMerge: true,
      checkToken: true,
      committer: 'committer',
      author: 'author',
      mainBranch: 'main-branch',
      frequency: 'patch',
      packagePatterns: ['package-patterns'],
      prAssignees: 'pull-request-assignees',
      skipTests: true,
      skipE2E: true,
      dryRun: true
    } satisfies ActionInputs);
    expect(runMock).toHaveReturned();
  });

  it('should have valid inputs with only token provided', async () => {
    getInputMock.mockImplementation((name: string) => {
      switch (name) {
        case 'token':
          return 'token';
        default:
          return '';
      }
    });
    getBooleanInputMock.mockImplementation(() => false);
    getMultilineInputMock.mockImplementation(() => []);
    await main.run();

    expect(nxMigrateMock).toHaveBeenCalledWith({
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
    } satisfies ActionInputs);
    expect(runMock).toHaveReturned();
  });

  it('should have invalid inputs with missing required inputs', async () => {
    getInputMock.mockReturnValue('');
    await main.run();

    expect(setFailedMock).toHaveBeenCalled();
  });

  it('should set outputs', async () => {
    nxMigrateMock.mockResolvedValue({
      currentVersion: '1.0.0',
      isMigrated: true,
      latestVersion: '1.0.1',
      updateType: 'patch',
      pullRequest: 1
    } satisfies ActionOutputs);
    await main.run();

    expect(setOutputMock).toHaveBeenCalledWith('current-version', '1.0.0');
    expect(setOutputMock).toHaveBeenCalledWith('latest-version', '1.0.1');
    expect(setOutputMock).toHaveBeenCalledWith('update-type', 'patch');
    expect(setOutputMock).toHaveBeenCalledWith('is-migrated', true);
    expect(setOutputMock).toHaveBeenCalledWith('pull-request', 1);
  });

  it('should handle errors', async () => {
    getInputMock.mockImplementation((name: string) => {
      switch (name) {
        case 'token':
          return 'token';
        default:
          return '';
      }
    });
    getBooleanInputMock.mockImplementation(() => false);
    getMultilineInputMock.mockImplementation(() => []);

    const error = new Error('error message');
    nxMigrateMock.mockRejectedValue(error);

    await main.run();
    expect(setFailedMock).toHaveBeenCalledWith('error message');
  });
});
