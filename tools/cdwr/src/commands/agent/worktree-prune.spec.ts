import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const run =
  vi.fn<
    (
      bin: string,
      args: string[],
      opts?: { cwd?: string }
    ) => Promise<{ stdout: string; stderr: string }>
  >();

vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return {
    ...actual,
    run: (bin: string, args: string[], opts?: { cwd?: string }) =>
      run(bin, args, opts)
  };
});

describe('agent worktree prune', () => {
  let dir: string;
  let main: string;
  let done: string;
  let kill: ReturnType<typeof vi.spyOn>;
  let ps: string;
  let listing: string;
  let calls: string[];
  let cwds: (string | undefined)[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cdwr-prune-'));
    main = join(dir, 'codeware');
    done = join(dir, 'codeware-cod-1');
    mkdirSync(main);
    mkdirSync(done);
    calls = [];
    cwds = [];
    listing = `worktree ${main}\nHEAD a\nbranch refs/heads/main\n\nworktree ${done}\nHEAD b\nbranch refs/heads/cod-1\n`;
    ps = '';
    kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    run.mockReset();
    run.mockImplementation(async (bin, args, opts) => {
      calls.push(`${bin} ${args.join(' ')}`);
      cwds.push(opts?.cwd);
      if (bin === 'ps' && args[0] === '-o') {
        // One pid's args, as `ps -o args= -p <pid>` prints them; exit 1 when it is gone
        const line = ps
          .split('\n')
          .find((l) => l.trim().split(/\s+/)[0] === args[3]);
        if (!line) throw new Error('ps: no such process');
        return {
          stdout: `${line.trim().replace(/^\d+\s+/, '')}\n`,
          stderr: ''
        };
      }
      if (bin === 'ps') return { stdout: ps, stderr: '' };
      if (bin === 'git' && args[0] === 'worktree' && args[1] === 'list') {
        return { stdout: listing, stderr: '' };
      }
      if (bin === 'git' && args[0] === 'worktree' && args[1] === 'remove') {
        listing = listing.split('\n\n')[0];
      }
      if (bin === 'gh') {
        return {
          stdout: '[{"number":1,"state":"MERGED","headRefOid":"tip"}]',
          stderr: ''
        };
      }
      if (bin === 'git' && args[0] === 'rev-parse') {
        return { stdout: 'tip\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    kill.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  async function prune(argv: string[], env: Record<string, string> = {}) {
    const ui = fakeUi([]);
    const command = (await import('./worktree-prune')).default;
    const exit = await runCommand({
      name: 'agent worktree prune',
      command,
      argv,
      root: main,
      env,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    return { exit, ui };
  }

  const daemon = (path: string) =>
    ` 4242 node ${path}/node_modules/.pnpm/nx@22.0.0/node_modules/nx/src/daemon/server/start.js\n`;

  it('stops the daemon before the worktree is removed', async () => {
    const { exit } = await prune(['--yes']);
    expect(exit).toBe(EXIT.ok);
    const stop = calls.findIndex((c) => c.includes('nx daemon --stop'));
    const remove = calls.findIndex((c) => c.startsWith('git worktree remove'));
    expect(calls[stop]).toBe(`pnpm -C ${done} exec nx daemon --stop`);
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(remove);
  });

  it('removes the worktree when the daemon stop fails', async () => {
    const base =
      run.getMockImplementation() ??
      (async () => ({
        stdout: '',
        stderr: ''
      }));
    run.mockImplementation(async (bin, args) => {
      if (bin === 'pnpm') throw new Error('no daemon');
      return base(bin, args);
    });
    const { exit, ui } = await prune(['--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(calls.some((c) => c.startsWith('git worktree remove'))).toBe(true);
    expect(ui.printed.warn.join(' ')).toContain('no daemon');
  });

  it('stops orphan daemons whose worktree is gone, not the main checkout one', async () => {
    ps =
      daemon(join(dir, 'codeware-cod-9')) + daemon(main).replace('4242', '1');
    await prune(['--yes']);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  it('stops the leftover daemon of a worktree it just removed', async () => {
    ps = daemon(done);
    await prune(['--yes']);
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  it('stops the daemon of a listed worktree whose directory is gone', async () => {
    const gone = join(dir, 'codeware-cod-7');
    listing += `\nworktree ${gone}\nHEAD c\nbranch refs/heads/cod-7\n`;
    ps = daemon(gone);
    await prune(['--yes']);
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  it('leaves a pid alone that no longer runs the orphan', async () => {
    ps = daemon(join(dir, 'codeware-cod-9'));
    const base = run.getMockImplementation();
    run.mockImplementation(async (bin, args) => {
      if (bin === 'ps' && args[0] === '-o') {
        return { stdout: 'vim notes.txt\n', stderr: '' };
      }
      return base!(bin, args);
    });
    await prune(['--yes']);
    expect(kill).not.toHaveBeenCalled();
  });

  it('lists and removes against the clone AGENT_QUEUE_WORKTREE_REPO names', async () => {
    const session = join(dir, 'codeware-session');
    mkdirSync(session);
    await prune(['--yes'], { AGENT_QUEUE_WORKTREE_REPO: session });
    expect(cwds[0]).toBe(session);
    expect(calls.some((c) => c.startsWith('git worktree remove'))).toBe(true);
    expect(cwds.filter((c) => c === main)).toEqual([]);
  });

  it('stops nothing on a dry run', async () => {
    ps = daemon(join(dir, 'codeware-cod-9'));
    const { exit } = await prune(['--dry-run']);
    expect(exit).toBe(EXIT.ok);
    expect(kill).not.toHaveBeenCalled();
    expect(calls.some((c) => c.includes('daemon --stop'))).toBe(false);
    expect(calls.some((c) => c.startsWith('git worktree remove'))).toBe(false);
  });
});
