import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearUmamiTokens,
  createUmamiSession,
  umamiLogin
} from './umami-session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const text = (body: string, status: number) => new Response(body, { status });

const isLogin = (url: unknown) => String(url).endsWith('/api/auth/login');

const session = (fetchImpl: typeof fetch, username = 'admin') =>
  createUmamiSession({
    url: 'https://umami.test/',
    username,
    password: 'admin-password',
    timeoutMs: 5000,
    consumer: 'the cms',
    fetchImpl
  });

const setup = (response: Response) => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) =>
    isLogin(url) ? json({ token: 'login-token' }) : response.clone()
  );
  return { fetchImpl, ...session(fetchImpl) };
};

const loginCalls = (f: ReturnType<typeof setup>['fetchImpl']) =>
  f.mock.calls.filter(([url]) => isLogin(url));

describe('createUmamiSession', () => {
  beforeEach(() => {
    clearUmamiTokens();
  });

  it('signs in with the credentials, then makes the call with the token', async () => {
    const { fetchImpl, request } = setup(json({}));

    await request({ path: 'users/u-1' });

    const [first, second] = fetchImpl.mock.calls;
    expect(String(first?.[0])).toBe('https://umami.test/api/auth/login');
    expect(first?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(first?.[1]?.body))).toEqual({
      username: 'admin',
      password: 'admin-password'
    });
    expect(String(second?.[0])).toBe('https://umami.test/api/users/u-1');
    expect(second?.[1]?.headers).toMatchObject({
      authorization: 'Bearer login-token'
    });
  });

  it('reuses the token within the cache time', async () => {
    const { fetchImpl, request } = setup(json({}));

    await request({ path: 'users/u-1' });
    await request({ path: 'users/u-1' });

    expect(loginCalls(fetchImpl)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('shares the token between sessions of the same url and user only', async () => {
    const { fetchImpl, request } = setup(json({}));
    const other = session(fetchImpl, 'someone-else');

    await request({ path: 'users/u-1' });
    await session(fetchImpl).request({ path: 'users/u-1' });
    await other.request({ path: 'users/u-1' });

    expect(loginCalls(fetchImpl)).toHaveLength(2);
  });

  it('signs in again once the cached token has expired', async () => {
    vi.useFakeTimers();
    try {
      const { fetchImpl, request } = setup(json({}));

      await request({ path: 'users/u-1' });
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      await request({ path: 'users/u-1' });

      expect(loginCalls(fetchImpl)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('signs in again on a 401 and retries the call once', async () => {
    const replies = [
      json({ token: 'old' }),
      text('', 401),
      json({ token: 'new' }),
      json({ id: 'u-1' })
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () => replies.shift()!);

    const answer = await session(fetchImpl).request({ path: 'users/u-1' });

    expect(answer.status).toBe(200);
    expect(fetchImpl.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer new'
    });
  });

  it('returns a second 401 without trying again', async () => {
    const { fetchImpl, request } = setup(text('', 401));

    await expect(request({ path: 'users/u-1' })).resolves.toMatchObject({
      status: 401
    });
    // login, call, login, call
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('umamiLogin', () => {
  const options = (fetchImpl: typeof fetch) => ({
    url: 'https://umami.test',
    username: 'admin',
    password: 'pw-secret',
    timeoutMs: 5000,
    consumer: 'stats-accounts',
    fetchImpl
  });

  it('answers the token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ token: 'tok', user: { id: 'a' } })
    );

    await expect(umamiLogin(options(fetchImpl))).resolves.toBe('tok');
  });

  it('fails clearly for a user with 2FA, naming who needs a user without', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ requiresTwoFactor: true, partialToken: 'partial' })
    );

    await expect(umamiLogin(options(fetchImpl))).rejects.toMatchObject({
      kind: 'refused',
      message: expect.stringMatching(/has 2FA.*stats-accounts/)
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws an UmamiError with the status, never the password', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => text('', 401));

    const error = await umamiLogin(options(fetchImpl)).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'UmamiError', kind: 'refused' });
    expect((error as Error).message).toBe('Umami auth/login: status 401');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('calls a waking Umami unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => text('', 503));

    await expect(umamiLogin(options(fetchImpl))).rejects.toMatchObject({
      kind: 'unavailable'
    });
  });

  it('rejects an answer without a token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({}));

    await expect(umamiLogin(options(fetchImpl))).rejects.toMatchObject({
      kind: 'bad-answer'
    });
  });

  it('rejects an answer that is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => text('<html>', 200));

    await expect(umamiLogin(options(fetchImpl))).rejects.toMatchObject({
      kind: 'bad-answer'
    });
  });
});
