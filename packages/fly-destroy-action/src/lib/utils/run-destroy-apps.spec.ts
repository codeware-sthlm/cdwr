import * as core from '@actions/core';
import type { Fly } from '@cdwr/fly-node';
import { getPullRequest } from '@codeware/shared/util/github';

import { runDestroyApps } from './run-destroy-apps';

vi.mock('@codeware/shared/util/github', () => ({
  getPullRequest: vi.fn()
}));

vi.mock('@actions/core', () => {
  const summary = {
    addHeading: vi.fn(),
    addList: vi.fn(),
    write: vi.fn()
  };
  summary.addHeading.mockReturnValue(summary);
  summary.addList.mockReturnValue(summary);
  summary.write.mockResolvedValue(summary);
  return { info: vi.fn(), warning: vi.fn(), summary };
});

const getPullRequestMock = vi.mocked(getPullRequest);

/** PR states by number; absent means not found */
const prStates: Record<number, 'open' | 'closed'> = {};

const setup = (
  names: string[],
  destroy: (...args: unknown[]) => Promise<unknown> = async () => ({
    detachFailures: []
  })
) => {
  const list = vi.fn(async () => names.map((name) => ({ name })));
  const destroyMock = vi.fn(destroy);
  const fly = { apps: { list, destroy: destroyMock } } as unknown as Fly;
  return { fly, destroy: destroyMock };
};

describe('runDestroyApps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(prStates)) {
      delete prStates[Number(key)];
    }
    getPullRequestMock.mockImplementation(async (_token, number) => {
      const state = prStates[number];
      return state ? ({ state } as never) : null;
    });
  });

  it('destroys a closed PR app and warns about a failed detach', async () => {
    prStates[7] = 'closed';
    const { fly, destroy } = setup(['cms-pr-7'], async () => ({
      detachFailures: [{ cluster: 'pg-preview', error: 'no such role' }]
    }));

    const result = await runDestroyApps('t', fly);

    expect(result).toEqual({ destroyed: ['cms-pr-7'], skipped: [] });
    expect(destroy).toHaveBeenCalledWith('cms-pr-7', {
      allowDetachFailure: true
    });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("detach from 'pg-preview' failed")
    );
  });

  it('skips the app when the destroy rejects', async () => {
    prStates[7] = 'closed';
    const { fly } = setup(['cms-pr-7'], async () => {
      throw new Error('boom');
    });

    const result = await runDestroyApps('t', fly);

    expect(result).toEqual({ destroyed: [], skipped: ['cms-pr-7'] });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to destroy app')
    );
  });

  it('destroys nothing in a dry run', async () => {
    prStates[7] = 'closed';
    const { fly, destroy } = setup(['cms-pr-7']);

    const result = await runDestroyApps('t', fly, true);

    expect(result).toEqual({ destroyed: [], skipped: [] });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('leaves open PR apps and apps without a PR number alone', async () => {
    prStates[8] = 'open';
    const { fly, destroy } = setup(['cms-pr-8', 'cms-main']);

    const result = await runDestroyApps('t', fly);

    expect(result).toEqual({ destroyed: [], skipped: [] });
    expect(destroy).not.toHaveBeenCalled();
  });
});
