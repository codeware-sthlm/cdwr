import { beforeEach, describe, expect, it } from 'vitest';

import { rateLimit, resetRateLimits } from './rate-limit';

const START = 1_800_000_000_000;

describe('rateLimit', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('takes submissions up to the limit and refuses the next one', () => {
    const config = { limit: 3, windowMs: 60_000, now: () => START };

    expect(rateLimit('a', config)).toEqual({ ok: true });
    expect(rateLimit('a', config)).toEqual({ ok: true });
    expect(rateLimit('a', config)).toEqual({ ok: true });
    expect(rateLimit('a', config)).toEqual({
      ok: false,
      retryAfterSeconds: 60
    });
  });

  it('counts each caller on its own', () => {
    const config = { limit: 1, windowMs: 60_000, now: () => START };

    expect(rateLimit('first', config)).toEqual({ ok: true });
    expect(rateLimit('second', config)).toEqual({ ok: true });
    expect(rateLimit('first', config)).toMatchObject({ ok: false });
  });

  it('says how long to wait, counting from the oldest submission', () => {
    let clock = START;
    const config = { limit: 2, windowMs: 60_000, now: () => clock };

    rateLimit('a', config);
    clock = START + 20_000;
    rateLimit('a', config);
    clock = START + 30_000;

    // The first one drops out of the window 30s from now
    expect(rateLimit('a', config)).toEqual({
      ok: false,
      retryAfterSeconds: 30
    });
  });

  it('lets the caller back in once the window has passed', () => {
    let clock = START;
    const config = { limit: 1, windowMs: 60_000, now: () => clock };

    expect(rateLimit('a', config)).toEqual({ ok: true });
    expect(rateLimit('a', config)).toMatchObject({ ok: false });

    clock = START + 60_001;

    expect(rateLimit('a', config)).toEqual({ ok: true });
  });
});
