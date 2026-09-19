import { EventEmitter } from 'node:events';

import { runStreaming } from './shell';

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid = 4242;
  kill = vi.fn();
}

let fakeChild: FakeChild;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => fakeChild)
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
