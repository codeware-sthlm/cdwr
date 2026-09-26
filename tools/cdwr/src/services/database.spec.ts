import { SilentNoOpError, isGuardedNoOp, retryGuardedNoOp } from './database';
import { CommandError } from './shell';

const guarded = () =>
  new CommandError(
    'pnpm exec tsx src/utils/x.ts',
    '',
    '\nError: the script ended without completing.\n\n  Nothing was reported and nothing was done — see COD-433.\n',
    1
  );

const real = () =>
  new CommandError(
    'pnpm exec tsx src/utils/x.ts',
    '',
    'Error: no such tenant',
    1
  );

describe('isGuardedNoOp', () => {
  it('recognises the exit guard by its message on stderr', () => {
    expect(isGuardedNoOp(guarded())).toBe(true);
  });

  it('recognises a clean exit that never reported as the same race', () => {
    expect(
      isGuardedNoOp(new SilentNoOpError('apply-site.ts', 'APPLY_REPORT'))
    ).toBe(true);
  });

  it('does not mistake a real failure for the race', () => {
    expect(isGuardedNoOp(real())).toBe(false);
    expect(isGuardedNoOp(new Error('ended without completing'))).toBe(false);
  });
});

describe('retryGuardedNoOp', () => {
  it('returns the first success without a retry', async () => {
    const work = vi.fn(async () => 'ok');

    await expect(retryGuardedNoOp(work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('runs again while the guard says nothing happened', async () => {
    // Each guarded failure is a proven no-op, so repeating the same script
    // with the same inputs is the same as running it once
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(guarded())
      .mockRejectedValueOnce(guarded())
      .mockResolvedValueOnce('ok');

    await expect(retryGuardedNoOp(work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('throws any other failure at once, since repeating it would only repeat it', async () => {
    const work = vi.fn<() => Promise<string>>().mockRejectedValue(real());

    await expect(retryGuardedNoOp(work)).rejects.toThrow('no such tenant');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('gives up after the bound and says nothing was changed', async () => {
    const work = vi.fn<() => Promise<string>>().mockRejectedValue(guarded());

    await expect(retryGuardedNoOp(work, 3)).rejects.toThrow(
      'did nothing 3 times in a row'
    );
    expect(work).toHaveBeenCalledTimes(3);
  });
});
