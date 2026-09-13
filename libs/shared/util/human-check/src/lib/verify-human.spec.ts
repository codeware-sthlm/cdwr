import { describe, expect, it, vi } from 'vitest';

import { verifyHuman } from './verify-human';

const NOW = 1_800_000_000_000;
const now = () => NOW;

/** Drawn long enough ago that the timing gate is open. */
const drawnAt = NOW - 10_000;

const turnstileSays = (
  payload: { success?: boolean; 'error-codes'?: Array<string> },
  init: { ok?: boolean } = {}
) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: init.ok === false ? 500 : 200
      })
  ) as unknown as typeof fetch;

describe('verifyHuman', () => {
  it('refuses a submission that filled the hidden field', async () => {
    const fetchImpl = turnstileSays({ success: true });

    const result = await verifyHuman(
      { honeypot: 'https://buy-things.example', drawnAt, token: 'ok' },
      { secretKey: 'secret', fetchImpl, now }
    );

    expect(result).toEqual({ ok: false, reason: 'honeypot' });
    // Refused before anything left the machine
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a submission that arrived faster than a person could type', async () => {
    const result = await verifyHuman(
      { drawnAt: NOW - 200, token: 'ok' },
      { secretKey: 'secret', fetchImpl: turnstileSays({ success: true }), now }
    );

    expect(result).toEqual({ ok: false, reason: 'too-fast' });
  });

  it('refuses a submission that never said when it was drawn', async () => {
    const result = await verifyHuman({ token: 'ok' }, { secretKey: 's', now });

    expect(result).toEqual({ ok: false, reason: 'too-fast' });
  });

  it('accepts a token Turnstile recognises, and tells it who asked', async () => {
    const fetchImpl = turnstileSays({ success: true });

    const result = await verifyHuman(
      { drawnAt, token: 'a-real-token' },
      { secretKey: 'the-secret', ip: '203.0.113.7', fetchImpl, now }
    );

    expect(result).toEqual({ ok: true });

    const [, request] = vi.mocked(fetchImpl).mock.calls[0];
    // Bounded, so a verifier that hangs cannot hold the route open
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const sent = new URLSearchParams(String(request?.body));
    expect(Object.fromEntries(sent)).toEqual({
      secret: 'the-secret',
      response: 'a-real-token',
      remoteip: '203.0.113.7'
    });
  });

  it('refuses a token Turnstile rejects', async () => {
    const result = await verifyHuman(
      { drawnAt, token: 'forged' },
      {
        secretKey: 's',
        fetchImpl: turnstileSays({
          success: false,
          'error-codes': ['invalid-input-response']
        }),
        now
      }
    );

    expect(result).toEqual({ ok: false, reason: 'token-rejected' });
  });

  it('refuses a token that has already been used', async () => {
    const result = await verifyHuman(
      { drawnAt, token: 'used-once-already' },
      {
        secretKey: 's',
        fetchImpl: turnstileSays({
          success: false,
          'error-codes': ['timeout-or-duplicate']
        }),
        now
      }
    );

    expect(result).toEqual({ ok: false, reason: 'token-rejected' });
  });

  it('refuses when a key is configured but no token was sent', async () => {
    const fetchImpl = turnstileSays({ success: true });

    const result = await verifyHuman(
      { drawnAt },
      { secretKey: 's', fetchImpl, now }
    );

    expect(result).toEqual({ ok: false, reason: 'missing-token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses rather than waves through when Turnstile cannot be reached', async () => {
    const unreachable = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;

    const result = await verifyHuman(
      { drawnAt, token: 'ok' },
      { secretKey: 's', fetchImpl: unreachable, now }
    );

    expect(result).toEqual({ ok: false, reason: 'verify-unavailable' });
  });

  it('refuses when Turnstile answers with an error status', async () => {
    const result = await verifyHuman(
      { drawnAt, token: 'ok' },
      { secretKey: 's', fetchImpl: turnstileSays({}, { ok: false }), now }
    );

    expect(result).toEqual({ ok: false, reason: 'verify-unavailable' });
  });

  it('still guards a site with no key, on the honeypot and the clock alone', async () => {
    const fetchImpl = turnstileSays({ success: true });

    expect(await verifyHuman({ drawnAt }, { fetchImpl, now })).toEqual({
      ok: true
    });
    expect(
      await verifyHuman({ drawnAt, honeypot: 'filled' }, { fetchImpl, now })
    ).toEqual({ ok: false, reason: 'honeypot' });
    expect(await verifyHuman({ drawnAt: NOW }, { fetchImpl, now })).toEqual({
      ok: false,
      reason: 'too-fast'
    });

    // Nothing to ask, so nobody was asked
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
