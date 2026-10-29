import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import type { QueuePaths } from './agent.logic';
import { WORKTREE_PREF } from './agent.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

type Job = { loaded: false } | { loaded: true; running: boolean };

let job: Job = { loaded: false };
let queue: QueuePaths;
const run = vi.fn<(bin: string, args: string[]) => Promise<unknown>>();

vi.mock('../../services/agent-queue', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/agent-queue')>();
  return {
    ...actual,
    requireHost: () => 'launchd',
    jobState: async () => job,
    currentUid: () => 501,
    paths: () => queue
  };
});
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: (bin: string, args: string[]) => run(bin, args) };
});

describe('agent uninstall', () => {
  let dir: string;
  let checkout: string;
  let prefs: ReturnType<typeof memoryPrefs>;

  beforeEach(() => {
    run.mockReset();
    run.mockResolvedValue({ stdout: '', stderr: '' });
    job = { loaded: false };
    dir = mkdtempSync(join(tmpdir(), 'cdwr-uninstall-'));
    checkout = join(dir, 'planner');
    mkdirSync(checkout);
    prefs = memoryPrefs();
    prefs.set(WORKTREE_PREF, checkout);
    queue = {
      home: join(dir, 'agent-queue'),
      lock: join(dir, 'agent-queue', 'queue.lock'),
      plist: join(dir, 'queue.plist')
    } as QueuePaths;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function uninstall(argv: string[]) {
    const ui = fakeUi([]);
    const printed: string[] = [];
    const command = (await import('./uninstall')).default;
    const exit = await runCommand({
      name: 'agent uninstall',
      command,
      argv,
      root: dir,
      env: {},
      prefs,
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (text) => printed.push(text)
    });
    return { exit, ui, text: JSON.stringify([ui.printed, printed]) };
  }

  it('refuses while a run is in progress', async () => {
    job = { loaded: true, running: true };
    const { exit, text } = await uninstall(['--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(text).toContain('A planning run is in progress');
    expect(run).not.toHaveBeenCalled();
  });

  it('unloads and removes a loaded job with its plist', async () => {
    job = { loaded: true, running: false };
    writeFileSync(queue.plist, '<plist/>');
    const { exit } = await uninstall(['--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledWith('launchctl', [
      'bootout',
      'gui/501/se.codeware.agent-queue'
    ]);
    expect(existsSync(queue.plist)).toBe(false);
    expect(existsSync(queue.lock)).toBe(false);
  });

  it('does nothing when no job is installed', async () => {
    const { exit, text } = await uninstall(['--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(text).toContain('No launchd job is installed');
    expect(run).not.toHaveBeenCalled();
  });

  it('plans nothing destructive on a dry run', async () => {
    job = { loaded: true, running: false };
    writeFileSync(queue.plist, '<plist/>');
    const { exit } = await uninstall(['--dry-run']);
    expect(exit).toBe(EXIT.ok);
    expect(run).not.toHaveBeenCalled();
    expect(existsSync(queue.plist)).toBe(true);
  });

  it('removes the planner checkout only with the flag, and clears the pref', async () => {
    const without = await uninstall(['--yes']);
    expect(without.text).not.toContain('git worktree');
    expect(prefs.get(WORKTREE_PREF)).toBe(checkout);

    const { exit } = await uninstall(['--worktree-remove', '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledWith('git', ['worktree', 'remove', checkout]);
    expect(run.mock.calls.flat().join(' ')).not.toContain('--force');
    expect(prefs.get(WORKTREE_PREF)).toBe('');
  });

  it('keeps the pref and reports when the checkout cannot be removed', async () => {
    run.mockRejectedValueOnce(new Error('contains modified files'));
    const { ui } = await uninstall(['--worktree-remove', '--yes']);
    expect(ui.printed.warn.join(' ')).toContain('left in place');
    expect(prefs.get(WORKTREE_PREF)).toBe(checkout);
  });
});
