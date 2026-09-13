import { describe, expect, it, vi } from 'vitest';

import { verifyHuman } from './verify-human';

/** Long enough over the form to open the timing gate. */
const elapsedMs = 10_000;

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
      { honeypot: 'https://buy-things.example', elapsedMs, token: 'ok' },
      { secretKey: 'secret', fetchImpl }
    );

    expect(result).toEqual({ ok: false, reason: 'honeypot' });
    // Refused before anything left the machine
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a submission that arrived faster than a person could type', async () => {
    const result = await verifyHuman(
      { elapsedMs: 200, token: 'ok' },
      { fetchImpl: turnstileSays({ success: true }) }
    );

    expect(result).toEqual({ ok: false, reason: 'too-fast' });
  });

  it('refuses a submission that never said how long it took', async () => {
    const result = await verifyHuman({ token: 'ok' }, {});

    expect(result).toEqual({ ok: false, reason: 'too-fast' });
  });

  it('with a key, judges a quick submission by its token and not the clock', async () => {
    const fetchImpl = turnstileSays({ success: true });

    // Someone choosing a saved autofill entry on a one-field form can send it
    // in well under a second. Where Turnstile is configured it has already
    // answered whether they are a person, so the clock has nothing to add
    const result = await verifyHuman(
      { elapsedMs: 300, token: 'a-real-token' },
      { secretKey: 's', fetchImpl }
    );

    expect(result).toEqual({ ok: true });
  });

  it('accepts a token Turnstile recognises, and tells it who asked', async () => {
    const fetchImpl = turnstileSays({ success: true });

    const result = await verifyHuman(
      { elapsedMs, token: 'a-real-token' },
      { secretKey: 'the-secret', ip: '203.0.113.7', fetchImpl }
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

  it('names no address when the visitor is not who it is talking to', async () => {
    const fetchImpl = turnstileSays({ success: true });

    // A submission forwarded by a first-party app arrives from that app's
    // machine. Offering Cloudflare that address as the one that solved the
    // challenge would ask it to check a claim nobody made
    await verifyHuman(
      { elapsedMs, token: 'a-real-token' },
      { secretKey: 'the-secret', fetchImpl }
    );

    const [, request] = vi.mocked(fetchImpl).mock.calls[0];
    const sent = new URLSearchParams(String(request?.body));

    expect(sent.has('remoteip')).toBe(false);
  });

  it('refuses a token Turnstile rejects', async () => {
    const result = await verifyHuman(
      { elapsedMs, token: 'forged' },
      {
        secretKey: 's',
        fetchImpl: turnstileSays({
          success: false,
          'error-codes': ['invalid-input-response']
        })
      }
    );

    expect(result).toEqual({ ok: false, reason: 'token-rejected' });
  });

  it('refuses a token that has already been used', async () => {
    const result = await verifyHuman(
      { elapsedMs, token: 'used-once-already' },
      {
        secretKey: 's',
        fetchImpl: turnstileSays({
          success: false,
          'error-codes': ['timeout-or-duplicate']
        })
      }
    );

    expect(result).toEqual({ ok: false, reason: 'token-rejected' });
  });

  it('refuses when a key is configured but no token was sent', async () => {
    const fetchImpl = turnstileSays({ success: true });

    const result = await verifyHuman(
      { elapsedMs },
      { secretKey: 's', fetchImpl }
    );

    expect(result).toEqual({ ok: false, reason: 'missing-token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses rather than waves through when Turnstile cannot be reached', async () => {
    const unreachable = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;

    const result = await verifyHuman(
      { elapsedMs, token: 'ok' },
      { secretKey: 's', fetchImpl: unreachable }
    );

    expect(result).toEqual({ ok: false, reason: 'verify-unavailable' });
  });

  it('refuses when Turnstile answers with an error status', async () => {
    const result = await verifyHuman(
      { elapsedMs, token: 'ok' },
      { secretKey: 's', fetchImpl: turnstileSays({}, { ok: false }) }
    );

    expect(result).toEqual({ ok: false, reason: 'verify-unavailable' });
  });

  it('treats a verifier answering with nothing as an outage', async () => {
    // `null` is valid JSON, and reading a verdict out of it would throw
    const nothing = vi.fn(
      async () => new Response('null', { status: 200 })
    ) as unknown as typeof fetch;

    const result = await verifyHuman(
      { elapsedMs, token: 'ok' },
      { secretKey: 's', fetchImpl: nothing }
    );

    expect(result).toEqual({ ok: false, reason: 'verify-unavailable' });
  });

  it('still guards a site with no key, on the honeypot and the clock alone', async () => {
    const fetchImpl = turnstileSays({ success: true });

    expect(await verifyHuman({ elapsedMs }, { fetchImpl })).toEqual({
      ok: true
    });
    expect(
      await verifyHuman({ elapsedMs, honeypot: 'filled' }, { fetchImpl })
    ).toEqual({ ok: false, reason: 'honeypot' });
    expect(await verifyHuman({ elapsedMs: 0 }, { fetchImpl })).toEqual({
      ok: false,
      reason: 'too-fast'
    });

    // Nothing to ask, so nobody was asked
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
