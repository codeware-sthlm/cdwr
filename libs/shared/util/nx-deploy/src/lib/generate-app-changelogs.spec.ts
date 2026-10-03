import { execSync } from 'node:child_process';

import { releaseChangelog } from 'nx/release';

import { generateAppChangelogs } from './generate-app-changelogs';

vi.mock('nx/release', () => ({ releaseChangelog: vi.fn() }));
vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

describe('generateAppChangelogs', () => {
  const mockReleaseChangelog = vi.mocked(releaseChangelog);

  const withContents = (contents: Record<string, string>) =>
    mockReleaseChangelog.mockImplementation(async ({ projects }) => {
      const name = (projects as string[])[0];
      return {
        projectChangelogs: {
          [name]: { contents: contents[name] ?? '' }
        }
      } as unknown as Awaited<ReturnType<typeof releaseChangelog>>;
    });

  const releases = new Map([
    [
      'cms',
      { version: '1.3.3-preview.467.3', previousVersion: '1.3.3-preview.467.2' }
    ],
    [
      'web',
      { version: '1.1.5-preview.467.3', previousVersion: '1.1.5-preview.467.2' }
    ]
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    withContents({});
    // Every previous tag exists unless a test says otherwise
    vi.mocked(execSync).mockReturnValue('');
  });

  it('should start a first release from the root commit', async () => {
    vi.mocked(execSync).mockImplementation((command) => {
      if (String(command).includes('refs/tags/api-0.0.0')) {
        throw new Error('not found');
      }
      return '';
    });
    const firstRef = vi.fn(() => 'abc123');

    await generateAppChangelogs({
      releases: new Map([
        ['api', { version: '0.0.1', previousVersion: '0.0.0' }]
      ]),
      createRelease: false,
      firstRef
    });

    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({ projects: ['api'], from: 'abc123' })
    );
  });

  it('should anchor `from` to each app own previous tag', async () => {
    // Regression: nx resolves `from` as the newest matching tag when it is not
    // given one. The workflow tags before generating, so that tag is this very
    // release and every range comes back empty. `from` is also a single global
    // option, hence one call per app.
    await generateAppChangelogs({ releases, createRelease: false });

    expect(mockReleaseChangelog).toHaveBeenCalledTimes(2);
    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({
        projects: ['cms'],
        from: 'cms-1.3.3-preview.467.2'
      })
    );
    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({
        projects: ['web'],
        from: 'web-1.1.5-preview.467.2'
      })
    );
  });

  it('should never write files, commit, tag or push', async () => {
    await generateAppChangelogs({ releases, createRelease: false });

    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({
        gitCommit: false,
        gitTag: false,
        gitPush: false,
        stageChanges: false
      })
    );
  });

  it('should drop apps whose range produced nothing', async () => {
    withContents({ web: '### Fixes\n- a' });

    const result = await generateAppChangelogs({
      releases,
      createRelease: false
    });

    expect([...result.keys()]).toEqual(['web']);
  });

  it('should create GitHub releases without forcing generation', async () => {
    await generateAppChangelogs({ releases, createRelease: true });

    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({
        createRelease: 'github',
        forceChangelogGeneration: false
      })
    );
  });

  it('should render without a release when previewing', async () => {
    await generateAppChangelogs({ releases, createRelease: false });

    expect(mockReleaseChangelog).toHaveBeenCalledWith(
      expect.objectContaining({
        createRelease: false,
        forceChangelogGeneration: true
      })
    );
  });

  it('should do nothing when there is nothing to release', async () => {
    const result = await generateAppChangelogs({
      releases: new Map(),
      createRelease: false
    });

    expect(result.size).toBe(0);
    expect(mockReleaseChangelog).not.toHaveBeenCalled();
  });
});
