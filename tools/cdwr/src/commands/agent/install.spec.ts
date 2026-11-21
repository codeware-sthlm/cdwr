import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '../../cli/context';
import { CliError, UsageError } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';

import type { QueueFile, QueuePaths } from './agent.logic';
import { attendedLinearServer, byFile } from './agent.logic';

vi.mock('../../cli/preflight', () => ({
  preflight: vi.fn(),
  locate: () => '/usr/bin'
}));

type Job =
  { loaded: false } | { loaded: true; running: boolean; script: string };

let job: Job = { loaded: false };
let auth: 'app' | 'key' | 'none' = 'none';
let claudeConfig: unknown;
let queue: QueuePaths;
let worktree = '';
const texts = new Map<string, string>();
const requireHost = vi.fn();

vi.mock('../../services/agent-queue', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/agent-queue')>();
  return {
    ...actual,
    requireHost: (...args: unknown[]) => requireHost(...args),
    jobState: async () => job,
    paths: () => queue,
    linearAuth: async () => auth,
    readClaudeConfig: () => claudeConfig,
    readQueueSources: () => ({
      source: byFile((file: QueueFile) => `source ${file}`)
    }),
    readText: (file: string) => texts.get(file),
    worktreeOf: () => worktree,
    currentUid: () => 501
  };
});
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: vi.fn(), sleep: vi.fn(), childEnv: () => ({}) };
});

describe('agent install plan', () => {
  let dir: string;

  beforeEach(() => {
    requireHost.mockReset();
    requireHost.mockReturnValue('launchd');
    job = { loaded: false };
    auth = 'none';
    claudeConfig = undefined;
    texts.clear();
    dir = mkdtempSync(join(tmpdir(), 'cdwr-install-'));
    worktree = join(dir, 'planner');
    const home = join(dir, 'agent-queue');
    queue = {
      home,
      lock: join(home, 'queue.lock'),
      script: join(home, 'run.sh'),
      logs: join(home, 'logs'),
      plist: join(dir, 'queue.plist'),
      files: byFile((file: QueueFile) => join(home, file))
    } as unknown as QueuePaths;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ctxOf = (
    interactive: boolean,
    env: Record<string, string> = {}
  ): Context =>
    ({
      env,
      root: dir,
      prefs: memoryPrefs(),
      ui: { interactive },
      flags: { nonInteractive: false }
    }) as unknown as Context;

  async function plan(
    inputs: { scheduler?: boolean; agentWorktree?: string } = {},
    ctx: Context = ctxOf(true)
  ) {
    const command = (await import('./install')).default;
    return command.plan(ctx, {
      scheduler: inputs.scheduler ?? false,
      agentWorktree: inputs.agentWorktree
    });
  }

  const labels = (result: { steps: (string | { label: string })[] }) =>
    result.steps.map((step) => (typeof step === 'string' ? step : step.label));

  /** The attended side as found in place, so only the scheduler parts can differ */
  function attendedCurrent() {
    auth = 'app';
    claudeConfig = {
      mcpServers: { agent_linear: attendedLinearServer(queue.files['lib.sh']) }
    };
    for (const file of Object.keys(queue.files) as QueueFile[]) {
      texts.set(queue.files[file], `source ${file}`);
    }
  }

  /** A planner checkout with its dependencies, so the worktree and deps steps drop out */
  function plannerCheckout() {
    mkdirSync(join(worktree, '.git'), { recursive: true });
    mkdirSync(join(worktree, 'node_modules'));
  }

  it('plans only the attended side on a Mac without a job', async () => {
    const result = await plan();
    expect(labels(result)).toEqual([
      'Install the queue scripts',
      "Store the Linear app's client id and secret in the Keychain",
      'Add the agent_linear MCP server to your Claude config'
    ]);
    expect(result.data.work.scheduler).toBe(false);
    const text = labels(result).join(' ').toLowerCase();
    expect(text).not.toContain('worktree');
    expect(text).not.toContain('dependencies');
    expect(text).not.toContain('launchd');
  });

  it('refuses to ask for credentials when not interactive', async () => {
    await expect(plan({}, ctxOf(false))).rejects.toBeInstanceOf(UsageError);
    await expect(plan({}, ctxOf(false))).rejects.toThrow('not in the Keychain');
  });

  it('adds the worktree, dependencies and launchd job with --scheduler', async () => {
    const result = await plan({ scheduler: true });
    expect(result.data.work.scheduler).toBe(true);
    expect(labels(result)).toEqual(
      expect.arrayContaining([
        'Create the worktree at origin/main',
        'Install dependencies',
        'Write the launchd job',
        'Load the launchd job'
      ])
    );
  });

  it('keeps the scheduler parts current when a job is loaded, rewriting a stale plist', async () => {
    attendedCurrent();
    plannerCheckout();
    job = { loaded: true, running: false, script: queue.script };
    texts.set(queue.plist, 'an older plist');
    const result = await plan();
    expect(result.data.work.scheduler).toBe(true);
    expect(labels(result)).toEqual([
      'Write the launchd job',
      'Reload the launchd job'
    ]);
  });

  it('plans nothing for a loaded job whose plist is current', async () => {
    attendedCurrent();
    plannerCheckout();
    job = { loaded: true, running: false, script: queue.script };
    const first = await plan();
    texts.set(queue.plist, first.data.plist);
    const result = await plan();
    expect(result.steps).toEqual([]);
    expect(result.nothing).toContain('launchd job are installed');
  });

  it('refuses --scheduler while a planning run is in progress', async () => {
    job = { loaded: true, running: true, script: queue.script };
    await expect(plan({ scheduler: true })).rejects.toThrow(
      'A planning run is in progress'
    );
    await expect(plan()).rejects.toThrow('A planning run is in progress');
  });

  it('does not check for a running job on an attended Mac', async () => {
    await expect(plan()).resolves.toBeDefined();
  });

  it('names --scheduler when --worktree is given without a scheduler', async () => {
    const error = await plan({ agentWorktree: worktree }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(UsageError);
    expect(String(error instanceof UsageError ? error.hint : '')).toContain(
      '--scheduler'
    );
  });

  it('refuses in the container by asking for the launchd host', async () => {
    requireHost.mockImplementation(() => {
      throw new CliError('The agent queue runs on macOS');
    });
    const env = { AGENT_QUEUE_HOST: 'container' };
    await expect(plan({}, ctxOf(true, env))).rejects.toThrow('macOS');
    expect(requireHost).toHaveBeenCalledWith(['launchd'], env);
  });

  it('plans nothing when the attended side is current', async () => {
    attendedCurrent();
    const result = await plan();
    expect(result.steps).toEqual([]);
    expect(result.nothing).toContain('attended side');
    expect(result.data.work.scheduler).toBe(false);
  });
});
