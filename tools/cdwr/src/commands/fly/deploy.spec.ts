import { fileURLToPath } from 'node:url';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const currentPullRequest = vi.fn();
const pullRequestBranch = vi.fn();
const runWorkflow = vi.fn();
const listWorkflowRuns = vi.fn();

vi.mock('../../services/github', () => ({
  currentPullRequest: (...a: unknown[]) => currentPullRequest(...a),
  pullRequestBranch: (...a: unknown[]) => pullRequestBranch(...a),
  runWorkflow: (...a: unknown[]) => runWorkflow(...a),
  listWorkflowRuns: (...a: unknown[]) => listWorkflowRuns(...a)
}));

// The real workspace, so the app choices come from the real nx.json
const root = fileURLToPath(new URL('../../../../..', import.meta.url));

const runDeploy = async (argv: string[]) => {
  const out: string[] = [];
  const { default: command } = await import('./deploy');
  const exit = await runCommand({
    name: 'fly deploy',
    command,
    argv,
    root,
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([]),
    history: () => undefined,
    stdout: (text) => out.push(text)
  });
  return { exit, out: out.join('') };
};

describe('fly deploy', () => {
  beforeEach(() => {
    currentPullRequest.mockReset().mockResolvedValue(undefined);
    pullRequestBranch.mockReset().mockResolvedValue('cod-521-builder');
    runWorkflow.mockReset().mockResolvedValue([]);
    listWorkflowRuns
      .mockReset()
      .mockResolvedValueOnce([{ id: 1, status: 'completed', url: 'u/1' }])
      .mockResolvedValue([
        {
          id: 2,
          status: 'queued',
          url: 'https://github.com/o/r/actions/runs/2'
        },
        { id: 1, status: 'completed', url: 'u/1' }
      ]);
  });

  it('needs a pull request for preview', async () => {
    const { exit } = await runDeploy([
      'builder',
      '--env',
      'preview',
      '--yes',
      '--non-interactive'
    ]);
    expect(exit).toBe(EXIT.usage);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('refuses --pr for production', async () => {
    const { exit } = await runDeploy([
      'builder',
      '--env',
      'production',
      '--pr',
      '5',
      '--yes',
      '--non-interactive'
    ]);
    expect(exit).toBe(EXIT.usage);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('dispatches preview from the pull request branch and reports the run', async () => {
    const { exit, out } = await runDeploy([
      'cms',
      '--env',
      'preview',
      '--pr',
      '566',
      '--tenant',
      'moon',
      '--yes',
      '--json'
    ]);
    expect(exit).toBe(EXIT.ok);
    expect(runWorkflow).toHaveBeenCalledWith(
      root,
      'fly-deployment.yml',
      'cod-521-builder',
      { app: 'cms', environment: 'preview', tenant: 'moon', 'pr-number': '566' }
    );
    expect(JSON.parse(out).result).toEqual({
      app: 'cms',
      environment: 'preview',
      pr: 566,
      tenant: 'moon',
      ref: 'cod-521-builder',
      runUrl: 'https://github.com/o/r/actions/runs/2'
    });
  });

  it('defaults to the pull request of the current branch', async () => {
    currentPullRequest.mockResolvedValue(42);
    const { exit } = await runDeploy([
      'builder',
      '--env',
      'preview',
      '--yes',
      '--non-interactive'
    ]);
    expect(exit).toBe(EXIT.ok);
    expect(runWorkflow).toHaveBeenCalledWith(
      root,
      'fly-deployment.yml',
      'cod-521-builder',
      { app: 'builder', environment: 'preview', 'pr-number': '42' }
    );
  });

  it('runs production from main', async () => {
    await runDeploy([
      'web',
      '--env',
      'production',
      '--yes',
      '--non-interactive'
    ]);
    expect(runWorkflow).toHaveBeenCalledWith(
      root,
      'fly-deployment.yml',
      'main',
      { app: 'web', environment: 'production' }
    );
  });

  it('dispatches nothing on a dry run', async () => {
    const { exit } = await runDeploy([
      'builder',
      '--env',
      'preview',
      '--pr',
      '566',
      '--dry-run',
      '--non-interactive'
    ]);
    expect(exit).toBe(EXIT.ok);
    expect(runWorkflow).not.toHaveBeenCalled();
  });
});
