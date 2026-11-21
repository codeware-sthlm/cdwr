import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

// The container's wake: loop.pid names the loop, SIGUSR1 wakes it
describe('agent run in the container', () => {
  let home: string;
  let queueHome: string;
  let kill: ReturnType<typeof vi.spyOn>;
  const signals: Array<[number, string | number | undefined]> = [];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cdwr-run-'));
    queueHome = join(home, 'agent-queue');
    mkdirSync(queueHome, { recursive: true });
    signals.length = 0;
    const real = process.kill.bind(process);
    // Signal 0 only probes; anything else is recorded, never sent
    kill = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: string | number
    ) => {
      if (signal === 0) return real(pid, 0);
      signals.push([pid, signal]);
      return true;
    }) as typeof process.kill);
  });

  afterEach(() => {
    kill.mockRestore();
    rmSync(home, { recursive: true, force: true });
  });

  async function run(argv: string[]) {
    const ui = fakeUi([]);
    const printed: string[] = [];
    const command = (await import('./run')).default;
    const exit = await runCommand({
      name: 'agent run',
      command,
      argv,
      root: '/nowhere',
      env: { AGENT_QUEUE_HOST: 'container', CDWR_HOME: home },
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (text) => printed.push(text)
    });
    const last = JSON.parse(printed.at(-1) ?? '{}') as {
      nothing?: string;
      plan: { steps: unknown[] };
      result: { summary: string };
    };
    return { exit, last };
  }

  it('does nothing while the queue is paused', async () => {
    writeFileSync(join(queueHome, 'paused'), '');
    writeFileSync(join(queueHome, 'loop.pid'), `${process.pid}\n`);
    const { exit, last } = await run(['--yes', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(last?.['nothing']).toContain('The queue is paused');
    expect(signals).toEqual([]);
  });

  it('does nothing without a loop.pid, and says to deploy', async () => {
    const { exit, last } = await run(['--yes', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(last?.['nothing']).toContain('No container loop to wake');
    expect(last?.['nothing']).toContain('cdwr agent deploy');
    expect(signals).toEqual([]);
  });

  it('does nothing when loop.pid is not a pid', async () => {
    writeFileSync(join(queueHome, 'loop.pid'), 'garbage\n');
    const { last } = await run(['--yes', '--json']);
    expect(last?.['nothing']).toContain('No container loop to wake');
  });

  it('does nothing when the loop is gone', async () => {
    writeFileSync(join(queueHome, 'loop.pid'), '2147483646\n');
    const { last } = await run(['--yes', '--json']);
    expect(last?.['nothing']).toContain('No container loop to wake');
    expect(signals).toEqual([]);
  });

  it('plans one step for a live loop and sends nothing on a dry run', async () => {
    writeFileSync(join(queueHome, 'loop.pid'), `${process.pid}\n`);
    const { exit, last } = await run(['--dry-run', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(last?.['plan'].steps).toEqual([
      { label: 'Wake the container loop', detail: `pid ${process.pid}` }
    ]);
    expect(signals).toEqual([]);
  });

  it('wakes a live loop with SIGUSR1', async () => {
    writeFileSync(join(queueHome, 'loop.pid'), `${process.pid}\n`);
    const { exit, last } = await run(['--yes', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(signals).toEqual([[process.pid, 'SIGUSR1']]);
    expect(last?.['result'].summary).toBe('Container loop woken');
  });
});
