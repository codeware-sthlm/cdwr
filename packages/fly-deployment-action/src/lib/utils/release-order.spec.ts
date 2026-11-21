import * as exec from '@actions/exec';

import {
  checkReleaseOrder,
  holdsRelease,
  latestReleaseTag,
  releaseTag
} from './release-order';

vi.mock('@actions/exec');

const mockGetExecOutput = vi.mocked(exec.getExecOutput);

const output = (
  stdout: string,
  exitCode = 0,
  stderr = ''
): Awaited<ReturnType<typeof exec.getExecOutput>> => ({
  exitCode,
  stderr,
  stdout
});

describe('releaseTag', () => {
  it('should accept a production release tag of the project', () => {
    expect(releaseTag('cms', 'cms-1.2.3')).toBe('cms-1.2.3');
  });

  it('should reject a preview tag', () => {
    expect(releaseTag('cms', 'cms-1.2.3-preview.12.3')).toBeNull();
  });

  it('should reject the tag of another project sharing the prefix', () => {
    expect(releaseTag('cms', 'cms-web-1.2.3')).toBeNull();
  });
});

describe('latestReleaseTag', () => {
  beforeEach(() => {
    mockGetExecOutput.mockReset();
  });

  it('should return the first production tag, skipping previews', async () => {
    mockGetExecOutput.mockResolvedValue(
      output('cms-1.3.0-preview.4.1\ncms-1.2.3\ncms-1.2.2\n')
    );

    await expect(latestReleaseTag('cms')).resolves.toBe('cms-1.2.3');
  });

  it('should return null when there are no tags', async () => {
    mockGetExecOutput.mockResolvedValue(output(''));

    await expect(latestReleaseTag('cms')).resolves.toBeNull();
  });

  it('should list the tags merged into origin/main, newest first', async () => {
    mockGetExecOutput.mockResolvedValue(output('cms-1.2.3\n'));

    await latestReleaseTag('cms');

    expect(mockGetExecOutput).toHaveBeenCalledWith(
      'git',
      [
        'tag',
        '--list',
        'cms-*',
        '--merged',
        'origin/main',
        '--sort=-v:refname'
      ],
      { silent: true }
    );
  });
});

describe('holdsRelease', () => {
  beforeEach(() => {
    mockGetExecOutput.mockReset();
  });

  it('should return true when git exits 0', async () => {
    mockGetExecOutput.mockResolvedValue(output('', 0));

    await expect(holdsRelease('cms-1.2.3', 'abcdef1')).resolves.toBe(true);
    expect(mockGetExecOutput).toHaveBeenCalledWith(
      'git',
      ['merge-base', '--is-ancestor', 'refs/tags/cms-1.2.3', 'abcdef1'],
      { silent: true, ignoreReturnCode: true }
    );
  });

  it('should return false when git exits 1', async () => {
    mockGetExecOutput.mockResolvedValue(output('', 1));

    await expect(holdsRelease('cms-1.2.3', 'abcdef1')).resolves.toBe(false);
  });

  it('should throw with the stderr when git fails otherwise', async () => {
    mockGetExecOutput.mockResolvedValue(
      output('', 128, 'fatal: Not a valid object name abcdef1\n')
    );

    await expect(holdsRelease('cms-1.2.3', 'abcdef1')).rejects.toThrow(
      /exited 128: fatal: Not a valid object name abcdef1/
    );
  });
});

describe('checkReleaseOrder', () => {
  const sha = 'abcdef1234567890abcdef1234567890abcdef12';

  beforeEach(() => {
    mockGetExecOutput.mockReset();
  });

  it('should deploy a project without a release, without a merge-base call', async () => {
    mockGetExecOutput.mockResolvedValue(output(''));

    await expect(checkReleaseOrder('cms', sha)).resolves.toEqual({
      deploy: true
    });
    expect(mockGetExecOutput).toHaveBeenCalledTimes(1);
  });

  it('should deploy when the commit holds the newest release', async () => {
    mockGetExecOutput
      .mockResolvedValueOnce(output('cms-1.2.3\n'))
      .mockResolvedValueOnce(output('', 0));

    await expect(checkReleaseOrder('cms', sha)).resolves.toEqual({
      deploy: true
    });
  });

  it('should skip when the commit is older than the newest release', async () => {
    mockGetExecOutput
      .mockResolvedValueOnce(output('cms-1.2.3\n'))
      .mockResolvedValueOnce(output('', 1));

    await expect(checkReleaseOrder('cms', sha)).resolves.toEqual({
      deploy: false,
      reason: 'abcdef1 is older than cms-1.2.3'
    });
  });

  it('should reject when git cannot be read', async () => {
    mockGetExecOutput
      .mockResolvedValueOnce(output('cms-1.2.3\n'))
      .mockResolvedValueOnce(output('', 128, 'fatal: bad object'));

    await expect(checkReleaseOrder('cms', sha)).rejects.toThrow(
      /fatal: bad object/
    );
  });
});
