import * as exec from '@actions/exec';

import { resolveRanges } from './resolve-ranges';

vi.mock('@actions/exec');

describe('resolveRanges', () => {
  const mockGetExecOutput = vi.mocked(exec.getExecOutput);
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
        'rev-parse FETCH_HEAD': 'headsha',
        'merge-base origin/main headsha': 'basesha'
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
          ['web', { base: 'basesha', head: 'headsha' }],
          ['cms', { base: 'basesha', head: 'headsha' }]
        ])
      );
    });

    it('falls back to HEAD without a PR number', async () => {
      mockGit({
        'rev-parse HEAD': 'headsha',
        'merge-base origin/main headsha': 'basesha'
      });

      const ranges = await resolveRanges({
        preid: 'preview.0',
        previousVersions
      });

      expect(gitCalls().some((args) => args?.[0] === 'fetch')).toBe(false);
      expect(ranges.get('web')).toEqual({ base: 'basesha', head: 'headsha' });
    });
  });

  describe('production', () => {
    it('starts each app at its last release tag', async () => {
      mockGit({
        'rev-parse HEAD': 'headsha',
        'rev-parse -q --verify refs/tags/': 'tagsha'
      });

      const ranges = await resolveRanges({ previousVersions });

      expect(ranges).toEqual(
        new Map([
          ['web', { base: 'web-1.1.3', head: 'headsha' }],
          ['cms', { base: 'cms-1.3.1', head: 'headsha' }]
        ])
      );
    });

    it('starts at the root commit when the tag does not exist', async () => {
      mockGit({
        'rev-parse HEAD': 'headsha',
        'rev-parse -q --verify refs/tags/': '',
        'rev-list --max-parents=0 HEAD': 'rootsha\nother'
      });

      const ranges = await resolveRanges({
        previousVersions: new Map([['web', '0.0.0']])
      });

      expect(ranges.get('web')).toEqual({ base: 'rootsha', head: 'headsha' });
    });
  });
});
