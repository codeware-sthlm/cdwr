import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoiseAsync } from './memoise-async';

describe('memoiseAsync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one run between concurrent calls', async () => {
    const load = vi.fn(async () => 'a');
    const memo = memoiseAsync(load, 30_000);

    const [x, y] = await Promise.all([memo(), memo()]);

    expect([x, y]).toEqual(['a', 'a']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reuses a result until the time to live has passed', async () => {
    const load = vi.fn(async () => 'a');
    const memo = memoiseAsync(load, 30_000);

    await memo();
    vi.advanceTimersByTime(29_999);
    await memo();
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await memo();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('a');
    const memo = memoiseAsync(load, 30_000);

    await expect(memo()).rejects.toThrow('down');
    await expect(memo()).resolves.toBe('a');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
