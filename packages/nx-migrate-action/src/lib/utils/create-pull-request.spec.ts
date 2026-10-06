import * as github from '@actions/github';

import { createPullRequest } from './create-pull-request';
import type { MigrateConfig } from './types';

vi.mock('@actions/core', () => ({ info: vi.fn() }));
vi.mock('@actions/github');
vi.mock('@codeware/shared/util/github', () => ({
  withGitHub: (fn: () => unknown) => fn()
}));

const createMock = vi.fn().mockResolvedValue({ data: { number: 1 } });
vi.spyOn(github, 'getOctokit').mockReturnValue({
  rest: { pulls: { create: createMock } }
} as never);

const config = {
  mainBranch: 'main',
  skipE2E: true,
  skipTests: true,
  token: 'token'
} as MigrateConfig;

const versionInfo = { currentVersion: '1.0.0', latestVersion: '1.1.0' };

const bodyOf = () => createMock.mock.calls[0][0].body as string;

describe('createPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ data: { number: 1 } });
  });

  it('leaves out the deferred prompts section when there are none', async () => {
    await createPullRequest(config, versionInfo, {});

    expect(bodyOf()).not.toContain('prompt migration');
  });

  it('lists deferred prompt migrations', async () => {
    await createPullRequest(config, versionInfo, {
      deferredPrompts: [
        { name: '1-1-0-do-thing', prompt: 'tools/ai-migrations/nx/1.1.0/a.md' }
      ]
    });

    expect(bodyOf()).toContain('⚠️ 1 prompt migration(s) were not applied');
    expect(bodyOf()).toContain(
      '- `tools/ai-migrations/nx/1.1.0/a.md` (`1-1-0-do-thing`)'
    );
  });

  it('keeps migration values from breaking out of their code span', async () => {
    await createPullRequest(config, versionInfo, {
      deferredPrompts: [
        {
          name: '`](https://evil.example) ✅ Tests passed',
          prompt: 'a.md`\n\n## Injected heading'
        }
      ]
    });

    const body = bodyOf();

    expect(body).toContain(
      '- `a.md ## Injected heading` (`](https://evil.example) ✅ Tests passed`)'
    );
    expect(body).not.toContain('## Injected heading\n');
  });
});
