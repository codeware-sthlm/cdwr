import { muted, unmutedWrite } from './muted';

describe('muted', () => {
  const original = process.stdout.write;
  afterEach(() => {
    process.stdout.write = original;
  });

  it('restores the writer once, however the calls overlap', async () => {
    const spy = vi.fn(() => true);
    process.stdout.write = spy as unknown as typeof process.stdout.write;
    const inner = muted(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const outer = muted(async () => {
      await inner;
    });
    process.stdout.write('muted');
    expect(spy).not.toHaveBeenCalled();
    await Promise.all([inner, outer]);
    process.stdout.write('back');
    expect(spy).toHaveBeenCalledWith('back');
  });

  it('still calls a write callback while muted, so stream barriers resolve', async () => {
    await muted(async () => {
      const done = vi.fn();
      process.stdout.write('', done);
      expect(done).toHaveBeenCalled();
    });
  });

  it('hands out a writer that passes every argument on', async () => {
    const spy = vi.fn((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === 'function') as
        | (() => void)
        | undefined;
      cb?.();
      return true;
    });
    process.stdout.write = spy as unknown as typeof process.stdout.write;
    await muted(async () => {
      const write = unmutedWrite();
      const done = vi.fn();
      write('x', done);
      expect(spy).toHaveBeenCalledWith('x', done);
      expect(done).toHaveBeenCalled();
    });
  });
});
