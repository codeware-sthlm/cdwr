import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';

import { memoryPrefs } from '../cli/prefs';
import { runCommand } from '../cli/run';
import { fakeUi } from '../testing/fake-ui';

import command from './release';

vi.mock('nx/release', () => ({
  releaseVersion: vi.fn(),
  releaseChangelog: vi.fn().mockResolvedValue({}),
  releasePublish: vi.fn()
}));

vi.mock('@nx/devkit', () => ({
  readJsonFile: vi.fn().mockReturnValue({ name: 'root', version: '1.0.0' }),
  writeJsonFile: vi.fn(),
  createProjectGraphAsync: vi.fn().mockResolvedValue({
    nodes: {
      pkg: {
        name: 'pkg',
        type: 'lib',
        data: { targets: { 'nx-release-publish': {} } }
      }
    }
  }),
  getPackageManagerCommand: vi.fn().mockReturnValue({ exec: 'pnpm exec' })
}));

vi.mock('npm-whoami', () => ({
  default: (cb: (err: unknown, user?: string) => void) => cb(null, 'someuser')
}));

vi.mock('../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/shell')>();
  return {
    ...actual,
    run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    runStreaming: vi.fn().mockResolvedValue(undefined)
  };
});

const run = async (argv: string[]) => {
  const ui = fakeUi([], false);
  const exit = await runCommand({
    name: 'release',
    command,
    argv,
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui,
    history: () => undefined,
    stdout: () => undefined
  });
  // A failed run says why, instead of an exit code alone
  if (ui.printed.error.length) throw new Error(ui.printed.error.join(' | '));
  return exit;
};

describe('release', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ends after the plan when there is no version to release', async () => {
    vi.mocked(releaseVersion).mockResolvedValue({
      projectsVersionData: {
        pkg: { currentVersion: '1.0.0', newVersion: null }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const exit = await run(['--mode', 'release', '--postpone-publish']);

    expect(exit).toBe(0);
    expect(releaseChangelog).not.toHaveBeenCalled();
    expect(releasePublish).not.toHaveBeenCalled();
  });

  it('defers to GitHub Actions when a version bump is postponed', async () => {
    vi.mocked(releaseVersion).mockResolvedValue({
      projectsVersionData: {
        pkg: { currentVersion: '1.0.0', newVersion: '1.1.0' }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const exit = await run([
      '--mode',
      'release',
      '--postpone-publish',
      '--yes'
    ]);

    expect(exit).toBe(0);
    expect(releaseVersion).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false })
    );
    expect(releaseChangelog).toHaveBeenCalled();
    expect(releasePublish).not.toHaveBeenCalled();
  });

  it('publishes directly in publish mode with a valid OTP', async () => {
    vi.mocked(releasePublish).mockResolvedValue({ pkg: { code: 0 } });

    const exit = await run(['--mode', 'publish', '--otp', '123456', '--yes']);

    expect(exit).toBe(0);
    expect(releasePublish).toHaveBeenCalledWith(
      expect.objectContaining({ otp: '123456', projects: ['pkg'] })
    );
  });
});
