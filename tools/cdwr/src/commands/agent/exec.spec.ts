import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command, { execArgv } from './exec';

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

describe('cdwr agent exec', () => {
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
