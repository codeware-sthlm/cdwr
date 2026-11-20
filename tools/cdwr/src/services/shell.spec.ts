import { EventEmitter } from 'node:events';

import { runStreaming } from './shell';

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid = 4242;
  kill = vi.fn();
}

let fakeChild: FakeChild;
/** True where a spec spawns real processes */
let realSpawn = false;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn((...args: Parameters<typeof actual.spawn>) =>
      realSpawn ? actual.spawn(...args) : fakeChild
    )
  };
});

describe('runStreaming', () => {
  beforeEach(() => {
    fakeChild = new FakeChild();
  });

  it('reassembles a line split across chunks instead of emitting fragments', async () => {
    const lines: string[] = [];
    const done = runStreaming('x', [], (line) => lines.push(line));

    fakeChild.stdout.emit('data', Buffer.from('hello '));
    fakeChild.stdout.emit('data', Buffer.from('world\n'));
    fakeChild.emit('exit', 0, null);

    await done;
    expect(lines).toEqual(['hello world']);
  });

  it('keeps stdout and stderr fragments apart', async () => {
    const lines: string[] = [];
    const done = runStreaming('x', [], (line) => lines.push(line));

    fakeChild.stdout.emit('data', Buffer.from('out-'));
    fakeChild.stderr.emit('data', Buffer.from('err-'));
    fakeChild.stdout.emit('data', Buffer.from('line\n'));
    fakeChild.stderr.emit('data', Buffer.from('line\n'));
    fakeChild.emit('exit', 0, null);

    await done;
    expect(lines).toEqual(['out-line', 'err-line']);
  });

  it('flushes a trailing fragment that never saw a newline', async () => {
    const lines: string[] = [];
    const done = runStreaming('x', [], (line) => lines.push(line));

    fakeChild.stdout.emit('data', Buffer.from('no trailing newline'));
    fakeChild.emit('exit', 0, null);

    await done;
    expect(lines).toEqual(['no trailing newline']);
  });

  it('rejects with the tail of output on a non-zero exit', async () => {
    const done = runStreaming('x', [], () => undefined);
    fakeChild.stdout.emit('data', Buffer.from('boom\n'));
    fakeChild.emit('exit', 1, null);

    await expect(done).rejects.toThrow('x failed (1): boom');
  });
});

describe('run', () => {
  it('rejects with the diagnostics when the child exits without reading its input', async () => {
    const { run } = await vi.importActual<typeof import('./shell')>('./shell');
    const error = await run(
      process.execPath,
      ['-e', 'console.error("nope"); process.exit(1)'],
      { input: 'x'.repeat(8 * 1024 * 1024) }
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('CommandError');
    expect((error as { stderr: string }).stderr).toContain('nope');
    expect((error as { code: unknown }).code).toBe(1);
  });
});

describe('hold', () => {
  const real = () => vi.importActual<typeof import('./shell')>('./shell');

  beforeEach(() => {
    realSpawn = true;
  });
  afterEach(() => {
    realSpawn = false;
  });

  it('resolves on the ready line and lets the child go when released', async () => {
    const { hold } = await real();
    // Exits only once its stdin closes, as `cat` does under flock
    const release = await hold(
      process.execPath,
      [
        '-e',
        'process.stdout.write("wait\\nlock");setTimeout(()=>process.stdout.write("ed\\n"),50);process.stdin.resume();process.stdin.on("end",()=>process.exit(0))'
      ],
      'locked'
    );
    await expect(release()).resolves.toBeUndefined();
  });

  it('rejects with the exit code when the child ends before it is ready', async () => {
    const { hold } = await real();
    const error = await hold(
      process.execPath,
      ['-e', 'console.error("busy"); process.exit(75)'],
      'locked'
    ).catch((e: unknown) => e);
    expect((error as Error).name).toBe('CommandError');
    expect((error as { code: unknown }).code).toBe(75);
    expect((error as { stderr: string }).stderr).toContain('busy');
  });
});
