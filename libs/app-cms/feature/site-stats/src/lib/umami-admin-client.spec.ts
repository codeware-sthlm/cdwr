import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearUmamiAdminTokens,
  createUmamiAdminClient
} from './umami-admin-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const setup = (response: Response) => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/api/auth/login')
      ? json({ token: 'login-token' })
      : response.clone()
  );
  const client = createUmamiAdminClient({
    baseUrl: 'https://umami.test/',
    username: 'admin',
    password: 'admin-password',
    fetchImpl
  });
  return { fetchImpl, client };
};

describe('createUmamiAdminClient', () => {
  beforeEach(() => {
    clearUmamiAdminTokens();
  });

  it('signs in, then calls Umami with the token', async () => {
    const { fetchImpl, client } = setup(
      json({ id: 'u-1', username: 'ada@b.test', role: 'view-only' })
    );

    await expect(client.getUser('u-1')).resolves.toEqual({
      id: 'u-1',
      username: 'ada@b.test'
    });

    const [login, call] = fetchImpl.mock.calls;
    expect(String(login?.[0])).toBe('https://umami.test/api/auth/login');
    expect(String(call?.[0])).toBe('https://umami.test/api/users/u-1');
    expect(call?.[1]?.headers).toMatchObject({
      authorization: 'Bearer login-token'
    });
  });

  it('names the cms when the login has 2FA', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ requiresTwoFactor: true, partialToken: 'partial' })
    );
    const client = createUmamiAdminClient({
      baseUrl: 'https://umami.test/',
      username: 'admin',
      password: 'admin-password',
      fetchImpl
    });

    await expect(client.getUser('u-1')).rejects.toThrow(
      'The Umami admin user has 2FA; the cms needs a user without it'
    );
  });

  it('exposes the user and team calls', () => {
    const { client } = setup(json({}));

    expect(Object.keys(client).sort()).toEqual([
      'addTeamUser',
      'createUser',
      'deleteUser',
      'getUser',
      'removeTeamUser',
      'setPassword'
    ]);
  });
});
