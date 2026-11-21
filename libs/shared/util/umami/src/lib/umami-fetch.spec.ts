import { describe, expect, it, vi } from 'vitest';

import { UmamiError, isWaking } from './errors';
import { parseUmamiJson, umamiFetch, umamiRefused } from './umami-fetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const setup = (response: Response | Error) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const send = (options: Partial<Parameters<typeof umamiFetch>[0]> = {}) =>
    umamiFetch({
      url: 'https://umami.test/',
      path: 'users/u-1',
      auth: { apiKey: 'secret-key' },
      timeoutMs: 5000,
      fetchImpl,
      ...options
    });
  return { fetchImpl, send };
};

describe('umamiFetch', () => {
  it('sends a bearer key under the api path and returns status and text', async () => {
    const { fetchImpl, send } = setup(json({ ok: true }));

    await expect(send()).resolves.toEqual({
      status: 200,
      ok: true,
      text: '{"ok":true}'
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://umami.test/api/users/u-1');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({
      authorization: 'Bearer secret-key',
      accept: 'application/json'
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends a login token as a bearer too', async () => {
    const { fetchImpl, send } = setup(json({}));

    await send({ auth: { token: 'login-token' } });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer login-token'
    });
  });

  it('sends no authorization without auth', async () => {
    const { fetchImpl, send } = setup(json({}));

    await send({ auth: undefined });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      accept: 'application/json'
    });
  });

  it('sends a body as JSON', async () => {
    const { fetchImpl, send } = setup(json({}));

    await send({ method: 'POST', body: { a: 1 } });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json'
    });
    expect(JSON.parse(String(init?.body))).toEqual({ a: 1 });
  });

  it('sends no body without one', async () => {
    const { fetchImpl, send } = setup(json({}));

    await send({ method: 'DELETE' });

    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('joins a base url with a base path and a leading slash path', async () => {
    const { fetchImpl, send } = setup(json({}));

    await send({ url: 'https://host.test/umami//', path: '/me?page=1' });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://host.test/umami/api/me?page=1'
    );
  });

  it('returns a refusal for the caller to judge, with its text', async () => {
    const { send } = setup(new Response('Nope', { status: 403 }));

    await expect(send()).resolves.toEqual({
      status: 403,
      ok: false,
      text: 'Nope'
    });
  });

  it.each([502, 503, 504])('calls a %i unavailable', async (status) => {
    const { send } = setup(json({}, status));

    const error = await send().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UmamiError);
    expect(error).toMatchObject({ kind: 'unavailable' });
    expect((error as Error).message).toBe(`Umami users/u-1: status ${status}`);
  });

  it('names the call by its label in errors', async () => {
    const { send } = setup(json({}, 503));

    await expect(send({ label: 'stats' })).rejects.toThrow('Umami stats:');
  });

  it('calls a dropped connection unavailable', async () => {
    const { send } = setup(new TypeError('fetch failed'));

    await expect(send()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('calls a timeout a timeout, never leaking the key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          );
        })
    );
    const error = await umamiFetch({
      url: 'https://umami.test',
      path: 'stats',
      auth: { apiKey: 'secret-key' },
      timeoutMs: 10,
      fetchImpl
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      kind: 'timeout',
      message: expect.stringMatching(/timed out after 10 ms/)
    });
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('calls a body that drops while read unavailable', async () => {
    const dropped = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'));
        }
      }),
      { status: 200 }
    );
    const { send } = setup(dropped);

    await expect(send()).rejects.toMatchObject({
      kind: 'unavailable',
      message: expect.stringContaining('dropped while reading')
    });
  });

  it('calls a body that times out while read a timeout', async () => {
    const stalled = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(
            Object.assign(new Error('aborted'), { name: 'TimeoutError' })
          );
        }
      }),
      { status: 200 }
    );
    const { send } = setup(stalled);

    await expect(send()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('counts a good answer as done when its body is not read, even if it would drop', async () => {
    const dropped = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'));
        }
      }),
      { status: 200 }
    );
    const { send } = setup(dropped);

    await expect(send({ readBody: false })).resolves.toEqual({
      status: 200,
      ok: true,
      text: ''
    });
  });

  it('still reads a refusal when the body is not wanted', async () => {
    const { send } = setup(new Response('Nope', { status: 400 }));

    await expect(send({ readBody: false })).resolves.toEqual({
      status: 400,
      ok: false,
      text: 'Nope'
    });
  });

  it('carries the status and body of a waking answer', async () => {
    const { send } = setup(new Response('Bad gateway', { status: 502 }));

    await expect(send()).rejects.toMatchObject({
      kind: 'unavailable',
      status: 502,
      detail: 'Bad gateway'
    });
  });

  it('keeps a refusal whose body drops', async () => {
    const dropped = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'));
        }
      }),
      { status: 403 }
    );
    const { send } = setup(dropped);

    await expect(send()).resolves.toEqual({
      status: 403,
      ok: false,
      text: ''
    });
  });
});

describe('parseUmamiJson', () => {
  it('parses JSON', () => {
    expect(parseUmamiJson('stats', '{"a":1}')).toEqual({ a: 1 });
  });

  it('calls anything else a bad answer', () => {
    expect(() => parseUmamiJson('stats', '<html>')).toThrow(
      expect.objectContaining({ kind: 'bad-answer' })
    );
  });
});

describe('umamiRefused', () => {
  it('carries the status as a refusal', () => {
    const error = umamiRefused('users', {
      status: 401,
      ok: false,
      text: ''
    });
    expect(error).toMatchObject({
      kind: 'refused',
      message: 'Umami users: status 401',
      status: 401,
      detail: ''
    });
  });

  it('keeps the start of the body as detail, out of the message', () => {
    const error = umamiRefused('users', {
      status: 400,
      ok: false,
      text: 'x'.repeat(500)
    });
    expect(error.message).toBe('Umami users: status 400');
    expect(error.status).toBe(400);
    expect(error.detail).toBe('x'.repeat(300));
  });
});

describe('isWaking', () => {
  it.each(['timeout', 'unavailable'] as const)('is true for %s', (kind) => {
    expect(isWaking(new UmamiError('x', kind))).toBe(true);
  });

  it.each(['refused', 'bad-answer'] as const)('is false for %s', (kind) => {
    expect(isWaking(new UmamiError('x', kind))).toBe(false);
  });

  it('is false for anything else', () => {
    expect(isWaking(new Error('x'))).toBe(false);
  });
});
