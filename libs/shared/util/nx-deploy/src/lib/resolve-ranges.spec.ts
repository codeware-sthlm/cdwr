import * as exec from '@actions/exec';

import { resolveRanges } from './resolve-ranges';

vi.mock('@actions/exec');

describe('resolveRanges', () => {
  const mockGetExecOutput = vi.mocked(exec.getExecOutput);
  const HEAD_SHA = 'a'.repeat(40);
  const BASE_SHA = 'b'.repeat(40);
  const ROOT_SHA = 'c'.repeat(40);
  const previousVersions = new Map([
    ['web', '1.1.3'],
    ['cms', '1.3.1']
  ]);

  /** Answers per git subcommand, keyed on the joined arguments */
  const mockGit = (answers: Record<string, string>) => {
    mockGetExecOutput.mockImplementation(async (_command, args) => {
      const key = (args ?? []).join(' ');
      const answer = Object.entries(answers).find(([prefix]) =>
        key.startsWith(prefix)
      );
      if (!answer) {
        throw new Error(`Unexpected git call: ${key}`);
      }
      return { exitCode: 0, stdout: `${answer[1]}\n`, stderr: '' };
    });
  };

  const gitCalls = () => mockGetExecOutput.mock.calls.map(([, a]) => a);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preview', () => {
    it('uses the merge-base with main up to the fetched PR head for every app', async () => {
      mockGit({
        fetch: '',
        'rev-parse --verify FETCH_HEAD^{commit}': HEAD_SHA,
        [`merge-base origin/main ${HEAD_SHA}`]: BASE_SHA
      });

      const ranges = await resolveRanges({
        preid: 'preview.466',
        prNumber: 466,
        previousVersions
      });

      expect(gitCalls()[0]).toEqual([
        'fetch',
        '--no-tags',
        'origin',
        '+refs/pull/466/head'
      ]);
      expect(ranges).toEqual(
        new Map([
          ['web', { base: BASE_SHA, head: HEAD_SHA }],
          ['cms', { base: BASE_SHA, head: HEAD_SHA }]
        ])
      );
    });

    it('falls back to HEAD without a PR number', async () => {
      mockGit({
        'rev-parse --verify HEAD^{commit}': HEAD_SHA,
        [`merge-base origin/main ${HEAD_SHA}`]: BASE_SHA
      });

      const ranges = await resolveRanges({
        preid: 'preview.0',
        previousVersions
      });

      expect(gitCalls().some((args) => args?.[0] === 'fetch')).toBe(false);
      expect(ranges.get('web')).toEqual({ base: BASE_SHA, head: HEAD_SHA });
    });
  });

  describe('preview validation', () => {
    const answers = () => ({
      fetch: '',
      'rev-parse --verify FETCH_HEAD^{commit}': HEAD_SHA,
      'rev-parse --verify HEAD^{commit}': HEAD_SHA,
      'merge-base': BASE_SHA
    });

    it('compares with a custom main branch', async () => {
      mockGit(answers());

      await resolveRanges({
        preid: 'preview.466',
        prNumber: 466,
        mainBranch: 'develop',
        previousVersions
      });

      expect(gitCalls()).toContainEqual([
        'merge-base',
        'origin/develop',
        HEAD_SHA
      ]);
    });

    it.each([0, -1, 1.5])('rejects pull request number %s', async (n) => {
      mockGit(answers());

      await expect(
        resolveRanges({ preid: 'preview.1', prNumber: n, previousVersions })
      ).rejects.toThrow('Not a pull request number');
      expect(gitCalls()).toHaveLength(0);
    });

    it.each(['--upload-pack=x', 'a b'])(
      'rejects main branch %j',
      async (mainBranch) => {
        mockGit(answers());

        await expect(
          resolveRanges({
            preid: 'preview.1',
            prNumber: 1,
            mainBranch,
            previousVersions
          })
        ).rejects.toThrow('Not a branch name');
        expect(gitCalls()).toHaveLength(0);
      }
    );

    it('throws when rev-parse does not return a commit SHA', async () => {
      mockGit({ ...answers(), 'rev-parse --verify HEAD^{commit}': 'nonsense' });

      await expect(
        resolveRanges({ preid: 'preview.0', previousVersions })
      ).rejects.toThrow('did not return a commit');
    });

    it('throws when merge-base does not return a commit SHA', async () => {
      mockGit({ ...answers(), 'merge-base': 'nonsense' });

      await expect(
        resolveRanges({ preid: 'preview.0', previousVersions })
      ).rejects.toThrow('did not return a commit');
    });
  });

  describe('production', () => {
    it('starts each app at its last release tag', async () => {
      mockGit({
        'rev-parse --verify HEAD^{commit}': HEAD_SHA,
        'rev-parse -q --verify refs/tags/': 'tagsha'
      });

      const ranges = await resolveRanges({ previousVersions });

      expect(ranges).toEqual(
        new Map([
          ['web', { base: 'web-1.1.3', head: HEAD_SHA }],
          ['cms', { base: 'cms-1.3.1', head: HEAD_SHA }]
        ])
      );
    });

    it('starts at the root commit when the tag does not exist', async () => {
      mockGit({
        'rev-parse --verify HEAD^{commit}': HEAD_SHA,
        'rev-parse -q --verify refs/tags/': '',
        'rev-list --max-parents=0 HEAD': `${ROOT_SHA}\n${BASE_SHA}`
      });

      const ranges = await resolveRanges({
        previousVersions: new Map([['web', '0.0.0']])
      });

      expect(ranges.get('web')).toEqual({ base: ROOT_SHA, head: HEAD_SHA });
    });
  });
});
