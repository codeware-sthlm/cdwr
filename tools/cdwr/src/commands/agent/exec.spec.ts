import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command, { execArgv, needsGh, shownArgs } from './exec';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const runInteractive =
  vi.fn<(binary: string, args: string[]) => Promise<number | null>>();
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return {
    ...actual,
    runInteractive: (binary: string, args: string[]) =>
      runInteractive(binary, args)
  };
});

const HOST = 'agent-host';

const run = (argv: string[]) =>
  runCommand({
    name: 'agent exec',
    command,
    argv,
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([], false),
    history: () => undefined,
    stdout: () => undefined
  });

beforeEach(() => {
  runInteractive.mockReset();
  runInteractive.mockResolvedValue(0);
});

describe('execArgv', () => {
  it('runs cdwr in the checkout through secrets.sh, one argument per entry', () => {
    expect(execArgv(HOST, ['agent', 'usage-record', '--days', '30'])).toEqual([
      HOST,
      'docker',
      'exec',
      '-w',
      '/work/codeware-agent',
      'cdwr-agent',
      '/opt/agent-host/secrets.sh',
      'node',
      'tools/cdwr/bin/cdwr.mjs',
      "'agent'",
      "'usage-record'",
      "'--days'",
      "'30'"
    ]);
  });

  it('quotes each argument, so the remote shell never runs one as a command', () => {
    expect(execArgv(HOST, ['agent', 'notify', "it's done; reboot"])).toEqual(
      expect.arrayContaining([`'it'\\''s done; reboot'`])
    );
  });
});

describe('execArgv with a GitHub token', () => {
  it('puts the wrapper right after secrets.sh', () => {
    const argv = execArgv(HOST, ['agent', 'worktree', 'prune'], true);
    const at = argv.indexOf('/opt/agent-host/secrets.sh');
    expect(argv.slice(at, at + 3)).toEqual([
      '/opt/agent-host/secrets.sh',
      '/opt/agent-host/with-gh-token.sh',
      'node'
    ]);
  });

  it('leaves it out by default', () => {
    expect(execArgv(HOST, ['agent', 'status'])).not.toContain(
      '/opt/agent-host/with-gh-token.sh'
    );
  });
});

describe('needsGh', () => {
  it('is true for a command that declares gh', async () => {
    expect(needsGh((await import('./worktree-prune')).default)).toBe(true);
  });

  it('is false for one without, and for an unknown command', async () => {
    expect(needsGh((await import('./status')).default)).toBe(false);
    expect(needsGh(undefined)).toBe(false);
  });
});

describe('shownArgs', () => {
  const release = async () => (await import('../release')).default;

  it.each([
    [
      ['release', '--otp', '123456', '--yes'],
      ['release', '--otp', '***', '--yes']
    ],
    [
      ['release', '--otp=123456'],
      ['release', '--otp=***']
    ],
    [
      ['release', '-o', '123456'],
      ['release', '-o', '***']
    ],
    [
      ['release', '-o123456'],
      ['release', '-o***']
    ]
  ])('hides the value of a secret input in %j', async (args, shown) => {
    expect(shownArgs(args, await release())).toEqual(shown);
  });

  it('keeps everything else, and everything for an unknown command', async () => {
    const args = ['release', '--dry-run', '--json'];
    expect(shownArgs(args, await release())).toEqual(args);
    expect(shownArgs(['nope', '--otp', '1'])).toEqual(['nope', '--otp', '1']);
  });
});

describe('cdwr agent exec', () => {
  it('sends a secret to the remote, and shows it nowhere', async () => {
    const ui = fakeUi([], false);
    const exit = await runCommand({
      name: 'agent exec',
      command,
      argv: ['-d', '--host', HOST, '--', 'release', '--otp', '123456'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    expect(exit).toBe(EXIT.ok);
    const printed = JSON.stringify(ui.printed);
    expect(printed).not.toContain('123456');
    expect(printed).toContain("'--otp' '***'");

    await run(['--host', HOST, '--', 'release', '--otp', '123456']);
    expect(runInteractive).toHaveBeenCalledWith(
      'ssh',
      execArgv(HOST, ['release', '--otp', '123456'])
    );
  });

  it('runs the args after -- over ssh, global flags included', async () => {
    const exit = await run([
      '--host',
      HOST,
      '--',
      'agent',
      'usage-record',
      '--dry-run'
    ]);
    expect(exit).toBe(EXIT.ok);
    expect(runInteractive).toHaveBeenCalledWith(
      'ssh',
      execArgv(HOST, ['agent', 'usage-record', '--dry-run'])
    );
  });

  it('runs a command that needs gh through the token wrapper, and one that does not without', async () => {
    await run([
      '--host',
      HOST,
      '--',
      'agent',
      'worktree',
      'prune',
      '--dry-run'
    ]);
    expect(runInteractive).toHaveBeenLastCalledWith(
      'ssh',
      execArgv(HOST, ['agent', 'worktree', 'prune', '--dry-run'], true)
    );
    expect(runInteractive.mock.calls[0]?.[1]).toContain(
      '/opt/agent-host/with-gh-token.sh'
    );

    await run(['--host', HOST, '--', 'agent', 'status']);
    expect(runInteractive.mock.calls[1]?.[1]).not.toContain(
      '/opt/agent-host/with-gh-token.sh'
    );
  });

  it('names the github app when no token could be minted', async () => {
    runInteractive.mockResolvedValue(75);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const exit = await run([
        '--host',
        HOST,
        '--',
        'agent',
        'worktree',
        'prune',
        '--dry-run'
      ]);
      expect(exit).toBe(75);
      expect(stderr.mock.calls.join('')).toContain(
        'github app: no token for cdwr agent worktree prune --dry-run on agent-host'
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it("reports 75 as the command's own exit when no wrapper ran", async () => {
    runInteractive.mockResolvedValue(75);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      expect(await run(['--host', HOST, '--', 'agent', 'status'])).toBe(75);
      const written = stderr.mock.calls.join('');
      expect(written).toContain('exited with 75');
      expect(written).not.toContain('github app');
    } finally {
      stderr.mockRestore();
    }
  });

  it("exits with the remote's exit code", async () => {
    runInteractive.mockResolvedValue(3);
    expect(await run(['--host', HOST, '--', 'agent', 'status'])).toBe(3);
  });

  it('fails when ssh never reached the host', async () => {
    runInteractive.mockResolvedValue(255);
    expect(await run(['--host', HOST, '--', 'agent', 'status'])).toBe(255);
  });

  it('fails when a signal ended it', async () => {
    runInteractive.mockResolvedValue(null);
    expect(await run(['--host', HOST, '--', 'agent', 'status'])).toBe(
      EXIT.failed
    );
  });

  it('prints the ssh line and runs nothing on a dry run before --', async () => {
    const exit = await run(['-d', '--host', HOST, '--', 'agent', 'pause']);
    expect(exit).toBe(EXIT.ok);
    expect(runInteractive).not.toHaveBeenCalled();
  });

  it.each([
    ['no host', ['--', 'agent', 'status']],
    ['a flag as host', ['--host', '-oProxyCommand=x', '--', 'agent', 'status']],
    ['no args', ['--host', HOST]],
    ['nothing after --', ['--host', HOST, '--']],
    ['--json before --', ['--json', '--host', HOST, '--', 'agent', 'status']]
  ])('refuses %s', async (_name, argv) => {
    expect(await run(argv)).toBe(EXIT.usage);
    expect(runInteractive).not.toHaveBeenCalled();
  });
});
