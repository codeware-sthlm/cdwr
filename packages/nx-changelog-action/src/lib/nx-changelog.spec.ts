import * as core from '@actions/core';
import * as github from '@actions/github';
import { generateAppChangelogs } from '@codeware/shared/util/nx-deploy';

import { nxChangelog } from './nx-changelog';
import type { ActionInputs } from './schemas/action-inputs.schema';

vi.mock('@actions/core');
vi.mock('@actions/github', () => ({
  context: { repo: { owner: 'acme', repo: 'platform' } },
  getOctokit: vi.fn()
}));
vi.mock('@codeware/shared/util/nx-deploy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codeware/shared/util/nx-deploy')>()),
  generateAppChangelogs: vi.fn()
}));

describe('nxChangelog', () => {
  const mockGenerate = vi.mocked(generateAppChangelogs);

  const app = (
    name: string,
    version = '1.1.0',
    previousVersion = '1.0.0'
  ): ActionInputs['apps'][number] => ({
    name,
    flyConfigFile: `apps/${name}/fly.toml`,
    githubConfig: {},
    version,
    previousVersion
  });

  const inputs = (overrides: Partial<ActionInputs> = {}): ActionInputs => ({
    apps: [app('cms'), app('web')],
    released: ['cms', 'web'],
    createRelease: false,
    token: 'token',
    ...overrides
  });

  const changelog = (name: string, markdown: string) => ({
    version: '1.1.0',
    tag: `${name}-1.1.0`,
    markdown
  });

  const getReleaseByTag = vi.fn();
  const createReleaseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockResolvedValue(new Map());
    // No release exists unless a test says otherwise
    getReleaseByTag.mockRejectedValue({ status: 404 });
    createReleaseMock.mockResolvedValue({});
    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        repos: { getReleaseByTag, createRelease: createReleaseMock }
      }
    } as unknown as ReturnType<typeof github.getOctokit>);
  });

  it('should render a changelog for every released app', async () => {
    mockGenerate.mockResolvedValue(
      new Map([
        ['cms', changelog('cms', '### Fixes\n- a')],
        ['web', changelog('web', '### Features\n- b')]
      ])
    );

    const result = await nxChangelog(inputs());

    expect(result.changelogs).toEqual({
      cms: '### Fixes\n- a',
      web: '### Features\n- b'
    });
    expect(github.getOctokit).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledWith({
      releases: new Map([
        ['cms', { version: '1.1.0', previousVersion: '1.0.0' }],
        ['web', { version: '1.1.0', previousVersion: '1.0.0' }]
      ])
    });
  });

  it('should skip apps that did not deploy', async () => {
    await nxChangelog(inputs({ released: ['cms'] }));

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        releases: new Map([
          ['cms', { version: '1.1.0', previousVersion: '1.0.0' }]
        ])
      })
    );
  });

  it('should skip a forced redeploy that shipped nothing new', async () => {
    // Manual dispatch of an unbumped app: version === previousVersion
    const result = await nxChangelog(
      inputs({ apps: [app('cms', '1.0.0', '1.0.0')], released: ['cms'] })
    );

    expect(result).toEqual({ changelogs: {}, failedReleases: [] });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  describe('create release', () => {
    beforeEach(() => {
      mockGenerate.mockResolvedValue(
        new Map([
          ['cms', changelog('cms', '### Fixes\n- a')],
          ['web', changelog('web', '### Features\n- b')]
        ])
      );
    });

    it('should create a release per app without taking over latest', async () => {
      const result = await nxChangelog(inputs({ createRelease: true }));

      expect(github.getOctokit).toHaveBeenCalledWith('token');
      expect(createReleaseMock).toHaveBeenCalledTimes(2);
      expect(createReleaseMock).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'platform',
        tag_name: 'cms-1.1.0',
        name: 'cms-1.1.0',
        body: '### Fixes\n- a',
        make_latest: 'false'
      });
      expect(core.info).toHaveBeenCalledWith('Created release web-1.1.0');
      expect(result.failedReleases).toEqual([]);
    });

    it('should leave an existing release alone', async () => {
      getReleaseByTag.mockResolvedValue({});

      const result = await nxChangelog(inputs({ createRelease: true }));

      expect(createReleaseMock).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Release cms-1.1.0 exists');
      expect(result.failedReleases).toEqual([]);
    });

    it('should treat an already-exists conflict as existing', async () => {
      createReleaseMock.mockRejectedValue({ status: 422 });

      const result = await nxChangelog(inputs({ createRelease: true }));

      expect(core.info).toHaveBeenCalledWith('Release cms-1.1.0 exists');
      expect(result.failedReleases).toEqual([]);
    });

    it('should warn on a failing app and still create the others', async () => {
      createReleaseMock.mockRejectedValueOnce(new Error('HTTP 500'));

      const result = await nxChangelog(inputs({ createRelease: true }));

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('cms-1.1.0')
      );
      expect(createReleaseMock).toHaveBeenCalledTimes(2);
      expect(result.failedReleases).toEqual(['cms-1.1.0']);
      expect(result.changelogs).toHaveProperty('web');
    });

    it('should make no Octokit calls when not creating releases', async () => {
      await nxChangelog(inputs({ createRelease: false }));

      expect(github.getOctokit).not.toHaveBeenCalled();
      expect(createReleaseMock).not.toHaveBeenCalled();
    });
  });

  it('should match on project name, not the tenant display label', async () => {
    // Regression: `deployed` is keyed `cms (demo)`, which never matches a
    // project. `deployed-projects` is the only safe source.
    await nxChangelog(inputs({ released: ['cms', 'web'] }));

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        releases: new Map([
          ['cms', { version: '1.1.0', previousVersion: '1.0.0' }],
          ['web', { version: '1.1.0', previousVersion: '1.0.0' }]
        ])
      })
    );
  });

  it('should return empty when nothing deployed', async () => {
    const result = await nxChangelog(inputs({ released: [] }));

    expect(result).toEqual({ changelogs: {}, failedReleases: [] });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
