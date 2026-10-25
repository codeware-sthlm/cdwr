import * as core from '@actions/core';

import * as main from './main';
import { nxChangelog } from './nx-changelog';

vi.mock('@actions/core');
vi.mock('./nx-changelog');

describe('main', () => {
  const getInputMock = vi.mocked(core.getInput);
  const nxChangelogMock = vi.mocked(nxChangelog);

  const app = {
    name: 'cms',
    flyConfigFile: 'apps/cms/fly.toml',
    githubConfig: {},
    version: '1.1.0',
    previousVersion: '1.0.0'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    nxChangelogMock.mockResolvedValue({ changelogs: {}, failedReleases: [] });
    vi.mocked(core.getBooleanInput).mockReturnValue(false);
  });

  const setInputs = (released: string) => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'apps') return JSON.stringify([app]);
      if (name === 'released') return released;
      if (name === 'token') return 'token';
      return '';
    });
  };

  it('should accept an array of project names', async () => {
    setInputs('["cms"]');
    await main.run();

    expect(nxChangelogMock).toHaveBeenCalledWith(
      expect.objectContaining({ released: ['cms'] })
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('should fail on the deployed map rather than silently match nothing', async () => {
    // Regression: passing `deployed` here used to yield labels like
    // `cms (demo)`, which match no project, so every changelog was skipped
    setInputs('{"cms (demo)":"https://cms.fly.dev"}');
    await main.run();

    expect(nxChangelogMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('deployed-projects')
    );
  });
});
