import { beforeEach, describe, expect, it, vi } from 'vitest';

import { guardHeaders, guardSubmit } from './guard-submit';
import { resetRateLimits } from './rate-limit';

const NOW = 1_800_000_000_000;

/** Filled in slowly enough to pass the clock, by a caller Fly can name. */
const person = {
  fields: { drawnAt: NOW - 10_000, honeypot: '', token: '' },
  headers: new Headers({ 'fly-client-ip': '203.0.113.7' })
};

describe('guardSubmit', () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers({ now: NOW });
  });

  it('lets a person through when nothing is configured', async () => {
    expect(await guardSubmit({ ...person, scope: 'form' })).toEqual({
      ok: true
    });
  });

  it('refuses without naming the gate that closed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await guardSubmit({
      ...person,
      fields: { ...person.fields, honeypot: 'filled by a script' },
      scope: 'form'
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: 'Could not accept this submission'
    });
    // The reason is for the log, not for whoever was refused
    expect(warn).toHaveBeenCalledWith('[form] submission refused: honeypot');
    expect(JSON.stringify(result)).not.toContain('honeypot');

    warn.mockRestore();
  });

  it('counts each endpoint on its own, and says when to come back', async () => {
    const config = { limit: 1, windowMs: 60_000 };

    expect(
      await guardSubmit({ ...person, scope: 'form', rateLimit: config })
    ).toEqual({ ok: true });

    // A different endpoint, same caller: untouched by the first one's count
    expect(
      await guardSubmit({ ...person, scope: 'tour-signup', rateLimit: config })
    ).toEqual({ ok: true });

    const refused = await guardSubmit({
      ...person,
      scope: 'form',
      rateLimit: config
    });

    expect(refused).toEqual({
      ok: false,
      status: 429,
      message: 'Too many submissions',
      retryAfterSeconds: 60
    });
    expect(guardHeaders(refused)).toEqual({ 'Retry-After': '60' });
  });

  it('carries no headers for anything but a refused rate', async () => {
    const passed = await guardSubmit({ ...person, scope: 'form' });

    expect(guardHeaders(passed)).toEqual({});
  });
});
