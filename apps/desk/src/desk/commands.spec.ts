import { describe, expect, it, vi } from 'vitest';

import { CommandError, checkToken, sendCommand } from './commands';

const URL_ = 'https://abcdefghij0123456789.supabase.co';

const answering = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status
      })
    )
  );

const target = (fetch: typeof globalThis.fetch) => ({
  supabaseUrl: URL_,
  controlToken: 'tok',
  fetch
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof CommandError ? error.code : 'other';
  }
  return 'resolved';
};

describe('checkToken', () => {
  it('posts a body that is not JSON with the token as the bearer', async () => {
    const fetch = answering(400, { error: 'Not JSON' });
    await checkToken(target(fetch));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${URL_}/functions/v1/desk-command`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok'
    );
    expect(() => JSON.parse(String(init?.body))).toThrow();
  });

  it.each([
    [401, 'unauthorized'],
    [500, 'server'],
    [202, 'server']
  ])('turns %i into %s', async (status, code) => {
    expect(await codeOf(checkToken(target(answering(status, {}))))).toBe(code);
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new TypeError('offline'))
    );
    expect(await codeOf(checkToken(target(fetch)))).toBe('network');
  });
});

describe('sendCommand', () => {
  it('sends the host, kind and value and returns the reply', async () => {
    const fetch = answering(202, { id: 7, status: 'pending', note: null });
    expect(await sendCommand(target(fetch), 'nuc', 'limit', 4)).toEqual({
      id: 7,
      status: 'pending',
      note: null
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      host: 'nuc',
      kind: 'limit',
      args: { value: 4 }
    });
  });

  it('sends empty args for a kind without a value', async () => {
    const fetch = answering(200, {
      id: 8,
      status: 'refused',
      note: 'no scheduler reports from nuc'
    });
    expect(await sendCommand(target(fetch), 'nuc', 'pause')).toEqual({
      id: 8,
      status: 'refused',
      note: 'no scheduler reports from nuc'
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).args).toEqual({});
  });

  it.each([
    [401, { error: 'Bad token' }, 'unauthorized'],
    [400, { error: 'Bad host' }, 'bad_request'],
    [500, { error: 'Write failed' }, 'server'],
    [202, { status: 'pending' }, 'server'],
    [200, { id: 1, status: 'done' }, 'server']
  ])('turns %i %j into %s', async (status, body, code) => {
    expect(
      await codeOf(sendCommand(target(answering(status, body)), 'nuc', 'run'))
    ).toBe(code);
  });

  it('carries the function’s error text', async () => {
    await expect(
      sendCommand(target(answering(400, { error: 'Bad host' })), 'nuc', 'run')
    ).rejects.toThrow('Bad host');
  });
});
