import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { CommandError } from '../../services/shell';
import { fakeUi } from '../../testing/fake-ui';

import { remoteCdwr } from './agent.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

type Call = [string, string[], { timeout?: number } | undefined];

const run =
  vi.fn<(...args: Call) => Promise<{ stdout: string; stderr: string }>>();
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: (...a: Call) => run(...a) };
});

const SECRETS = 'secrets: 12 loaded from infisical';
const out = (...envelopes: unknown[]) => ({
  stdout: `${SECRETS}\n${envelopes.map((e) => JSON.stringify(e)).join('\n')}\n`,
  stderr: ''
});

const dryRun = (command: string, label = 'A step', detail?: string) =>
  out({
    ok: true,
    command,
    dryRun: true,
    plan: { steps: [{ label, detail }] }
  });
const applied = (command: string, result: unknown) =>
  out({ ok: true, command, plan: { steps: [] }, result });
const nothing = (command: string, text: string) =>
  out({ ok: true, command, nothing: text });
const failure = (message: string, hint?: string) =>
  out({ ok: false, error: { message, hint, exitCode: 1 } });

const HOST = 'agent-host';

/** The runner's --json envelopes, as far as these specs read them */
interface Out {
  ok: boolean;
  nothing?: string;
  plan: { steps: unknown[] };
  result: unknown;
  error: { message: string; hint?: string };
}

const cases = [
  {
    name: 'agent pause',
    module: './pause',
    argv: [],
    args: ['agent', 'pause'],
    summary: 'Queue paused'
  },
  {
    name: 'agent resume',
    module: './resume',
    argv: [],
    args: ['agent', 'resume'],
    summary: 'Queue resumed'
  },
  {
    name: 'agent run',
    module: './run',
    argv: [],
    args: ['agent', 'run'],
    summary: 'Planning run started'
  },
  {
    name: 'agent notify',
    module: './notify',
    argv: ['action'],
    args: ['agent', 'notify', 'action'],
    summary: 'Notify level: action'
  }
] as const;

describe.each(cases)(
  '$name --host',
  ({ name, module, argv, args, summary }) => {
    beforeEach(() => {
      run.mockReset();
    });

    async function go(extra: string[]) {
      const ui = fakeUi([]);
      const printed: string[] = [];
      const command = (await import(/* @vite-ignore */ module)).default;
      const exit = await runCommand({
        name,
        command,
        argv: [...argv, '--host', HOST, ...extra],
        root: '/nowhere',
        env: {},
        prefs: memoryPrefs(),
        interactive: false,
        ui,
        history: () => undefined,
        stdout: (text) => printed.push(text)
      });
      const json = printed.map((p) => JSON.parse(p) as Out);
      return { exit, ui, json, last: json.at(-1) };
    }

    const sshArgs = () => run.mock.calls.map((c) => c[1]);

    it('plans with the remote dry run and shows its steps on the host', async () => {
      run.mockResolvedValue(dryRun(name, 'Do it', 'in the container'));
      const { exit, last } = await go(['--dry-run', '--json']);
      expect(exit).toBe(EXIT.ok);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]?.[0]).toBe('ssh');
      expect(sshArgs()[0]).toEqual(
        remoteCdwr(HOST, [...args, '--dry-run', '--json'])
      );
      expect(last?.['plan'].steps).toEqual([
        { label: 'Do it', detail: `in the container on ${HOST}` }
      ]);
    });

    it('applies with the remote --yes --json and passes its result through', async () => {
      const remoteResult = { summary: 'Remote said so', extra: 1 };
      run.mockImplementation(async (_bin, a) =>
        a.includes('--dry-run') ? dryRun(name) : applied(name, remoteResult)
      );
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.ok);
      expect(sshArgs()).toEqual([
        remoteCdwr(HOST, [...args, '--dry-run', '--json']),
        remoteCdwr(HOST, [...args, '--yes', '--json'])
      ]);
      expect(last?.['result']).toEqual(remoteResult);
    });

    it('falls back to its own summary for a result without one', async () => {
      run.mockImplementation(async (_bin, a) =>
        a.includes('--dry-run') ? dryRun(name) : applied(name, {})
      );
      const { ui } = await go(['--yes']);
      expect(ui.printed.outro.join(' ')).toContain(`${HOST}: ${summary}`);
    });

    it('shows what the remote has nothing to do as the host speaking', async () => {
      run.mockResolvedValue(nothing(name, 'Nothing to do here'));
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.ok);
      expect(run).toHaveBeenCalledTimes(1);
      expect(last).toMatchObject({
        ok: true,
        nothing: `${HOST}: Nothing to do here`
      });
    });

    it('fails with the remote message and hint', async () => {
      run.mockResolvedValue(failure('No scheduler', 'cdwr agent deploy'));
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.failed);
      expect(last?.['error']).toMatchObject({
        message: `${HOST}: No scheduler`,
        hint: 'cdwr agent deploy'
      });
    });

    it('fails naming the host when ssh gives no answer', async () => {
      run.mockRejectedValue(
        new CommandError('ssh', '', 'Connection refused\n', 255)
      );
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.failed);
      expect(last?.['error'].message).toContain(`ssh on ${HOST}`);
      expect(last?.['error'].message).toContain('Connection refused');
      expect(last?.['error'].hint).toContain('cdwr-agent');
    });

    it('uses the answer of a remote that exited non-zero', async () => {
      const bad = failure('Remote broke', 'look there');
      run.mockRejectedValue(new CommandError('ssh', bad.stdout, '', 1));
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.failed);
      expect(last?.['error']).toMatchObject({
        message: `${HOST}: Remote broke`,
        hint: 'look there'
      });
    });

    it('uses a nothing answered with a non-zero exit', async () => {
      run.mockRejectedValue(
        new CommandError('ssh', nothing(name, 'Idle').stdout, '', 1)
      );
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.ok);
      expect(last?.['nothing']).toBe(`${HOST}: Idle`);
    });

    it('says the versions differ when the answer cannot be read', async () => {
      run.mockResolvedValue({ stdout: 'no json here\n', stderr: '' });
      const { exit, last } = await go(['--yes', '--json']);
      expect(exit).toBe(EXIT.failed);
      expect(last?.['error'].message).toContain(
        `cdwr agent deploy --host ${HOST}`
      );
      expect(last?.['error'].message).toContain('no json here');
    });

    it('refuses a plan that applied, and an apply that only planned', async () => {
      run.mockResolvedValueOnce(applied(name, { summary: 'oops' }));
      const planned = await go(['--yes', '--json']);
      expect(planned.exit).toBe(EXIT.failed);
      expect(planned.last?.['error'].message).toContain(
        'applied instead of planning'
      );

      run.mockReset();
      run.mockResolvedValue(dryRun(name));
      const apply = await go(['--yes', '--json']);
      expect(apply.exit).toBe(EXIT.failed);
      expect(apply.last?.['error'].message).toContain(
        'planned instead of applying'
      );
    });
  }
);

describe('agent notify --host without a level', () => {
  it('asks the remote for its current level', async () => {
    run.mockReset();
    run.mockResolvedValue(nothing('agent notify', 'Notify level: all'));
    const ui = fakeUi([]);
    const printed: string[] = [];
    const command = (await import('./notify')).default;
    const exit = await runCommand({
      name: 'agent notify',
      command,
      argv: ['--host', HOST, '--json'],
      root: '/nowhere',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (text) => printed.push(text)
    });
    expect(exit).toBe(EXIT.ok);
    expect(run.mock.calls[0]?.[1]).toEqual(
      remoteCdwr(HOST, ['agent', 'notify', '--dry-run', '--json'])
    );
    expect(JSON.parse(printed[0] ?? '')).toMatchObject({
      nothing: `${HOST}: Notify level: all`
    });
  });
});
