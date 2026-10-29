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
      implementLock: join(dir, 'agent-queue', 'implement.lock'),
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

  it('removes the planner checkout only with the flag, and keeps the pref', async () => {
    const without = await uninstall(['--yes']);
    expect(without.text).not.toContain('git worktree');
    expect(prefs.get(WORKTREE_PREF)).toBe(checkout);

    const { exit } = await uninstall(['--worktree-remove', '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledWith('git', ['worktree', 'remove', checkout]);
    expect(run.mock.calls.flat().join(' ')).not.toContain('--force');
    expect(prefs.get(WORKTREE_PREF)).toBe(checkout);
  });

  it('keeps the pref and reports when the checkout cannot be removed', async () => {
    run.mockRejectedValueOnce(new Error('contains modified files'));
    const { ui } = await uninstall(['--worktree-remove', '--yes']);
    expect(ui.printed.warn.join(' ')).toContain('left in place');
    expect(prefs.get(WORKTREE_PREF)).toBe(checkout);
  });

  it('refuses to remove the checkout while an implementing session lives', async () => {
    mkdirSync(queue.implementLock, { recursive: true });
    writeFileSync(join(queue.implementLock, 'pid'), String(process.pid));
    const { exit, text } = await uninstall(['--worktree-remove', '--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(text).toContain('An implementing session is running');
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores an implement lock whose session is gone, or without the flag', async () => {
    mkdirSync(queue.implementLock, { recursive: true });
    writeFileSync(join(queue.implementLock, 'pid'), '2147483646');
    const gone = await uninstall(['--worktree-remove', '--yes']);
    expect(gone.exit).toBe(EXIT.ok);

    writeFileSync(join(queue.implementLock, 'pid'), String(process.pid));
    const without = await uninstall(['--yes']);
    expect(without.text).not.toContain('implementing session');
  });

  it('reports a stale queue lock with the command that removes it', async () => {
    job = { loaded: true, running: false };
    writeFileSync(queue.plist, '<plist/>');
    mkdirSync(queue.lock, { recursive: true });
    const { exit, text } = await uninstall(['--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(text).toContain('stale queue lock');
    expect(text).toContain(`rmdir ${queue.lock}`);
    expect(run).not.toHaveBeenCalled();
  });

  it('treats an implement lock without a pid as a session that is starting', async () => {
    mkdirSync(queue.implementLock, { recursive: true });
    const { exit, text } = await uninstall(['--worktree-remove', '--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(text).toContain('An implementing session is running');
    expect(run).not.toHaveBeenCalled();
  });

  it('holds the queue lock around the checkout removal and re-checks the session', async () => {
    let heldDuring = false;
    run.mockImplementation(async (bin) => {
      if (bin === 'git') heldDuring = existsSync(queue.lock);
      return { stdout: '', stderr: '' };
    });
    const first = await uninstall(['--worktree-remove', '--yes']);
    expect(first.exit).toBe(EXIT.ok);
    expect(heldDuring).toBe(true);
    expect(existsSync(queue.lock)).toBe(false);
  });

  it('keeps the checkout when a session starts after the plan', async () => {
    job = { loaded: true, running: false };
    run.mockImplementation(async (bin) => {
      if (bin === 'launchctl') {
        mkdirSync(queue.implementLock, { recursive: true });
        writeFileSync(join(queue.implementLock, 'pid'), String(process.pid));
      }
      return { stdout: '', stderr: '' };
    });
    const { ui } = await uninstall(['--worktree-remove', '--yes']);
    expect(run.mock.calls.map(([bin]) => bin)).toEqual(['launchctl']);
    expect(ui.printed.warn.join(' ')).toContain('implementing session');
    expect(existsSync(queue.lock)).toBe(false);
  });
});
