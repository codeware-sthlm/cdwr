import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { CommandError } from '../../services/shell';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

type Call = [string, string[], { input?: string } | undefined];

const run =
  vi.fn<(...args: Call) => Promise<{ stdout: string; stderr: string }>>();
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return {
    ...actual,
    run: (...a: Call) => run(...a),
    sleep: async () => undefined
  };
});

const ok = (stdout = '') => ({ stdout, stderr: '' });
const fail = (code: number) => new CommandError('ssh', '', '', code);

/** The remote command of an ssh call, without the host options */
const remote = (call: Call) => call[1].slice(3).join(' ');

describe('agent deploy', () => {
  let root: string;
  let ui: ReturnType<typeof fakeUi>;

  beforeEach(() => {
    run.mockReset();
    ui = fakeUi([]);
    root = mkdtempSync(join(tmpdir(), 'cdwr-deploy-'));
    mkdirSync(join(root, 'apps/agent-host'), { recursive: true });
    writeFileSync(join(root, 'apps/agent-host/compose.yaml'), 'services: {}\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function deploy(argv: string[]) {
    const command = (await import('./deploy')).default;
    return runCommand({
      name: 'agent deploy',
      command,
      argv,
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
  }

  const calls = (): string[] =>
    run.mock.calls.filter((c) => c[0] === 'ssh').map((c) => remote(c));

  it('dry run resolves the tag and touches nothing', async () => {
    run.mockResolvedValueOnce(ok('abcdef0123456789\n'));
    const exit = await deploy(['--host', 'nuc', '--dry-run']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('gh');
    expect(JSON.stringify(ui.printed)).toContain('sha-abcdef0');
  });

  it('rejects a bad tag before any call', async () => {
    const exit = await deploy(['--host', 'nuc', '--tag', 'latest', '--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the steps in order with a running container', async () => {
    run.mockImplementation(async (bin, args) => {
      const cmd = args.slice(3).join(' ');
      if (bin === 'ssh' && cmd.includes('State.Running')) return ok('true\n');
      if (bin === 'ssh' && cmd.includes('test -e')) throw fail(1);
      if (bin === 'ssh' && cmd.includes('State.Status')) {
        return ok('sha256:abc=running\n');
      }
      return ok();
    });
    const exit = await deploy([
      '--host',
      'nuc',
      '--tag',
      'sha-abcdef0',
      '--yes'
    ]);
    expect(exit).toBe(EXIT.ok);
    const steps = calls();
    const at = (needle: string) => steps.findIndex((s) => s.includes(needle));
    expect(at('State.Running')).toBe(0);
    expect(at('touch')).toBeGreaterThan(0);
    expect(at('lock')).toBeGreaterThan(at('touch'));
    expect(at('tee /opt/cdwr-agent/compose.yaml')).toBeGreaterThan(at('lock'));
    expect(at('tee /opt/cdwr-agent/image.env')).toBeGreaterThan(
      at('compose.yaml')
    );
    expect(at('pull')).toBeGreaterThan(at('image.env'));
    expect(at('up -d')).toBeGreaterThan(at('pull'));
    expect(at('rm -f')).toBeGreaterThan(at('up -d'));
    expect(at('State.Status')).toBeGreaterThan(at('rm -f'));
    const tagCall = run.mock.calls.find((c) =>
      c[1].includes('/opt/cdwr-agent/image.env')
    );
    expect(tagCall?.[2]?.input).toBe('AGENT_IMAGE_TAG=sha-abcdef0\n');
  });

  it('skips pause and wait when no container runs yet', async () => {
    run.mockImplementation(async (_bin, args) => {
      const cmd = args.slice(3).join(' ');
      if (cmd.includes('State.Running')) throw fail(1);
      if (cmd.includes('State.Status')) return ok('sha256:abc=running\n');
      return ok();
    });
    const exit = await deploy(['--host', 'nuc', '--tag', 'main', '--yes']);
    expect(exit).toBe(EXIT.ok);
    const steps = calls();
    expect(steps.some((s) => s.includes('touch'))).toBe(false);
    expect(steps.some((s) => s.includes('test -e'))).toBe(false);
    expect(steps.some((s) => s.includes('rm -f'))).toBe(false);
    expect(steps.some((s) => s.includes('up -d'))).toBe(true);
  });

  it('unpauses and stops when the queue stays busy', async () => {
    run.mockImplementation(async (_bin, args) => {
      const cmd = args.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith('test -e /home/agent/.cdwr/agent-queue/paused')) {
        throw fail(1);
      }
      return ok();
    });
    const exit = await deploy([
      '--host',
      'nuc',
      '--tag',
      'main',
      '--wait',
      '0',
      '--yes'
    ]);
    expect(exit).toBe(EXIT.failed);
    const steps = calls();
    expect(steps.at(-1)).toContain('rm -f');
    expect(steps.some((s) => s.includes('pull'))).toBe(false);
    expect(steps.some((s) => s.includes('image.env'))).toBe(false);
  });

  const args = ['--host', 'nuc', '--tag', 'main', '--yes'];

  it('leaves a pause the user set in place', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith('test -e /home/agent/.cdwr/agent-queue/paused')) {
        return ok();
      }
      if (cmd.includes('test -e')) throw fail(1);
      if (cmd.includes('State.Status')) return ok('sha256:abc=running\n');
      return ok();
    });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    const steps = calls();
    expect(steps.some((s) => s.includes('touch'))).toBe(false);
    expect(steps.some((s) => s.includes('rm -f'))).toBe(false);
    expect(JSON.stringify(ui.printed)).toContain('already paused');
  });

  it('unpauses and hints when the pull fails after pausing', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.includes('test -e')) throw fail(1);
      if (cmd.includes('pull')) throw fail(5);
      return ok();
    });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.failed);
    const steps = calls();
    expect(steps.some((s) => s.includes('up -d'))).toBe(false);
    expect(steps.at(-1)).toContain('rm -f');
    expect(JSON.stringify(ui.printed)).toContain('--tag');
  });

  it('unpauses and rethrows when the idle wait itself fails', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith('test -e /home/agent/.cdwr/agent-queue/paused')) {
        throw fail(1);
      }
      if (cmd.endsWith('test -e /home/agent/.cdwr/agent-queue/lock')) {
        throw new CommandError('ssh', '', 'connection lost', 255);
      }
      return ok();
    });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.failed);
    const steps = calls();
    expect(steps.at(-1)).toContain('rm -f');
    expect(steps.some((s) => s.includes('pull'))).toBe(false);
    expect(JSON.stringify(ui.printed)).toContain('connection lost');
  });

  it('says the queue may still be paused when the unpause fails after a busy timeout', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith('test -e /home/agent/.cdwr/agent-queue/paused')) {
        throw fail(1);
      }
      if (cmd.includes('rm -f')) throw fail(255);
      return ok();
    });
    const exit = await deploy([...args.slice(0, -1), '--wait', '0', '--yes']);
    expect(exit).toBe(EXIT.failed);
    const printed = JSON.stringify(ui.printed);
    expect(printed).toContain('may still be paused');
    expect(printed).toContain(
      'ssh nuc docker exec cdwr-agent rm -f /home/agent/.cdwr/agent-queue/paused'
    );
  });

  it('says the queue may still be paused when the unpause fails after a failed pull', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.includes('test -e')) throw fail(1);
      if (cmd.includes('pull')) throw fail(5);
      if (cmd.includes('rm -f')) throw fail(255);
      return ok();
    });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.failed);
    const printed = JSON.stringify(ui.printed);
    expect(printed).toContain('may still be paused');
    expect(printed).not.toContain('the queue was resumed');
  });

  const implementLock = (pidFile: () => ReturnType<typeof ok>) => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith('implement.lock')) return ok();
      if (cmd.includes('test -e')) throw fail(1);
      if (cmd.includes('implement.lock/pid')) return pidFile();
      if (cmd.includes('/proc/4242')) {
        if (alive) return ok();
        throw fail(1);
      }
      if (cmd.includes('State.Status')) return ok('sha256:abc=running\n');
      return ok();
    });
  };
  let alive = false;

  it('treats an implement.lock with a dead pid as not busy', async () => {
    alive = false;
    implementLock(() => ok('4242\n'));
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    expect(calls().some((s) => s.includes('image.env'))).toBe(true);
  });

  it('waits while the implement.lock pid is alive', async () => {
    alive = true;
    implementLock(() => ok('4242\n'));
    const exit = await deploy([...args.slice(0, -1), '--wait', '0', '--yes']);
    expect(exit).toBe(EXIT.failed);
    expect(calls().some((s) => s.includes('image.env'))).toBe(false);
  });

  const QUEUE = '/home/agent/.cdwr/agent-queue';

  /**
   * An implementing session polling in a wait.sh (pid 5151); `isWait` is asked
   * once per check, so a script can send it back to work between checks
   */
  const session = (opts: {
    isWait: () => boolean;
    runLockPid?: string;
    implementing?: boolean;
  }) => {
    const { implementing = true } = opts;
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.endsWith(`test -e ${QUEUE}/paused`)) throw fail(1);
      if (cmd.endsWith(`test -e ${QUEUE}/lock`)) {
        if (opts.runLockPid) return ok();
        throw fail(1);
      }
      if (cmd.endsWith(`cat ${QUEUE}/lock/pid`)) {
        return ok(`${opts.runLockPid}\n`);
      }
      if (cmd.includes('/proc/9999')) throw fail(1);
      if (cmd.endsWith(`test -e ${QUEUE}/implement.lock`)) {
        if (implementing) return ok();
        throw fail(1);
      }
      if (cmd.endsWith('implement.lock/pid')) return ok('4242\n');
      if (cmd.endsWith('implement.lock/key')) return ok('COD-752 answered\n');
      if (cmd.endsWith('implement.lock/waiting')) return ok('5151\n');
      if (cmd.includes('grep -qa wait.sh')) {
        if (opts.isWait()) return ok();
        throw fail(1);
      }
      if (cmd.includes('State.Status')) return ok('sha256:abc=running\n');
      return ok();
    });
  };

  const greps = () => calls().filter((s) => s.includes('grep -qa'));

  it('does not wait for a session that only waits in wait.sh, and names it', async () => {
    session({ isWait: () => true });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    // One look before the pull, one before the restart
    expect(greps()).toHaveLength(2);
    expect(calls().some((s) => s.includes('up -d'))).toBe(true);
    expect(JSON.stringify(ui.printed)).toContain(
      'Interrupted COD-752 (COD-752 answered), which was waiting in wait.sh; the next tick resumes it'
    );
  });

  it('waits as before while the session works', async () => {
    let n = 0;
    session({ isWait: () => ++n > 2 });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    expect(greps().length).toBeGreaterThan(2);
    expect(calls().some((s) => s.includes('up -d'))).toBe(true);
  });

  it('waits again when the session is working after the pull, then restarts', async () => {
    const script = [true, false, true];
    session({ isWait: () => script.shift() ?? true });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    expect(greps()).toHaveLength(3);
    const steps = calls();
    expect(steps.findIndex((s) => s.includes('up -d'))).toBeGreaterThan(
      steps.findIndex((s) => s.includes('pull'))
    );
  });

  it('stops before the restart when the session stays busy after the pull', async () => {
    const script = [true];
    session({ isWait: () => script.shift() ?? false });
    const exit = await deploy([...args.slice(0, -1), '--wait', '0', '--yes']);
    expect(exit).toBe(EXIT.failed);
    const steps = calls();
    expect(steps.some((s) => s.includes('pull'))).toBe(true);
    expect(steps.some((s) => s.includes('up -d'))).toBe(false);
    expect(steps.at(-1)).toContain('rm -f');
    const printed = JSON.stringify(ui.printed);
    expect(printed).toContain('the container was not restarted');
    expect(printed).toContain('Run the same deploy again');
  });

  it('with --force skips both checks and says what it cut', async () => {
    session({ isWait: () => false });
    const exit = await deploy([...args, '--force']);
    expect(exit).toBe(EXIT.ok);
    // Only one look, to report; nothing is waited for
    expect(greps()).toHaveLength(1);
    expect(calls().some((s) => s.includes('up -d'))).toBe(true);
    expect(JSON.stringify(ui.printed)).toContain(
      'Cut COD-752 (COD-752 answered) while it was working'
    );
  });

  it('raises the plan to destructive with --force only', async () => {
    const { plan } = (await import('./deploy')).default;
    const ctx = { root } as never;
    const base = { host: 'nuc', tag: 'main', wait: 30 };
    expect((await plan(ctx, { ...base, force: true })).danger).toBe(
      'destructive'
    );
    expect((await plan(ctx, { ...base, force: false })).danger).toBeUndefined();
  });

  it('treats a run lock with a dead pid as not busy', async () => {
    session({ isWait: () => true, runLockPid: '9999', implementing: false });
    const exit = await deploy(args);
    expect(exit).toBe(EXIT.ok);
    expect(calls().some((s) => s.includes('up -d'))).toBe(true);
    expect(greps()).toHaveLength(0);
  });

  it('uploads the compose file only after the wait', async () => {
    run.mockImplementation(async (_bin, a) => {
      const cmd = a.slice(3).join(' ');
      if (cmd.includes('State.Running')) return ok('true\n');
      if (cmd.includes('test -e')) throw fail(1);
      return ok();
    });
    await deploy(args);
    const steps = calls();
    const at = (needle: string) => steps.findIndex((s) => s.includes(needle));
    expect(at('compose.yaml')).toBeGreaterThan(at('lock'));
    expect(at('compose.yaml')).toBeLessThan(at('image.env'));
  });
});
