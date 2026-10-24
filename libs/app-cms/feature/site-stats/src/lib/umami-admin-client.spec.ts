import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UmamiNotFoundError,
  UmamiUserExistsError,
  clearUmamiAdminTokens,
  createUmamiAdminClient
} from './umami-admin-client';
import { UmamiError } from './umami-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const text = (body: string, status: number) => new Response(body, { status });

const isLogin = (url: unknown) => String(url).endsWith('/api/auth/login');

const setup = (response: Response | Error) => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    if (isLogin(url)) {
      return json({ token: 'login-token', user: { id: 'admin' } });
    }
    if (response instanceof Error) {
      throw response;
    }
    return response.clone();
  });
  const client = createUmamiAdminClient({
    baseUrl: 'https://umami.test/',
    username: 'admin',
    password: 'admin-password',
    fetchImpl
  });
  return { fetchImpl, client };
};

const call = (fetchImpl: ReturnType<typeof setup>['fetchImpl']) => {
  const [url, init] =
    fetchImpl.mock.calls.find(([called]) => !isLogin(called)) ?? [];
  return {
    url: String(url),
    init,
    body: init?.body ? JSON.parse(String(init.body)) : undefined
  };
};

describe('createUmamiAdminClient', () => {
  beforeEach(() => {
    clearUmamiAdminTokens();
  });

  describe('login', () => {
    const loginCalls = (f: ReturnType<typeof setup>['fetchImpl']) =>
      f.mock.calls.filter(([url]) => isLogin(url));

    it('signs in with the credentials, then makes the call with the token', async () => {
      const { fetchImpl, client } = setup(json({ id: 'u-1', username: 'a' }));

      await client.getUser('u-1');

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
      const { fetchImpl, client } = setup(json({ id: 'u-1', username: 'a' }));

      await client.getUser('u-1');
      await client.getUser('u-1');

      expect(loginCalls(fetchImpl)).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('signs in again on a 401 and retries the call once', async () => {
      const replies = [
        json({ token: 'old' }),
        text('', 401),
        json({ token: 'new' }),
        json({ id: 'u-1', username: 'a' })
      ];
      const fetchImpl = vi.fn<typeof fetch>(async () => replies.shift()!);
      const client = createUmamiAdminClient({
        baseUrl: 'https://umami.test/',
        username: 'admin',
        password: 'admin-password',
        fetchImpl
      });

      await expect(client.getUser('u-1')).resolves.toEqual({
        id: 'u-1',
        username: 'a'
      });
      expect(fetchImpl.mock.calls[3]?.[1]?.headers).toMatchObject({
        authorization: 'Bearer new'
      });
    });

    it('surfaces a second 401 without trying again', async () => {
      const { fetchImpl, client } = setup(text('', 401));

      await expect(client.getUser('u-1')).rejects.toMatchObject({
        name: 'UmamiError',
        kind: 'refused'
      });
      // login, call, login, call
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it('fails clearly for a user with 2FA', async () => {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        json({ requiresTwoFactor: true, partialToken: 'partial' })
      );
      const client = createUmamiAdminClient({
        baseUrl: 'https://umami.test/',
        username: 'admin',
        password: 'admin-password',
        fetchImpl
      });

      await expect(client.getUser('u-1')).rejects.toThrow(/has 2FA/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('throws an UmamiError with the status when the login fails', async () => {
      const fetchImpl = vi.fn<typeof fetch>(async () => text('', 401));
      const client = createUmamiAdminClient({
        baseUrl: 'https://umami.test/',
        username: 'admin',
        password: 'admin-password',
        fetchImpl
      });

      const error = await client.getUser('u-1').catch((e: unknown) => e);
      expect(error).toMatchObject({ name: 'UmamiError', kind: 'refused' });
      expect((error as Error).message).toBe('Umami auth/login: status 401');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('createUser', () => {
    it('posts the user with the login token and returns it', async () => {
      const { fetchImpl, client } = setup(
        json({ id: 'u-1', username: 'anna@titan.test', role: 'view-only' })
      );

      const user = await client.createUser({
        username: 'anna@titan.test',
        password: 'long-enough',
        role: 'view-only'
      });

      const { url, init, body } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/users');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer login-token',
        'content-type': 'application/json'
      });
      expect(body).toEqual({
        username: 'anna@titan.test',
        password: 'long-enough',
        role: 'view-only'
      });
      expect(user).toMatchObject({ id: 'u-1', username: 'anna@titan.test' });
    });

    it('surfaces a taken username as its own error', async () => {
      const { client } = setup(text('User already exists', 400));

      await expect(
        client.createUser({
          username: 'a@b.test',
          password: 'x'.repeat(8),
          role: 'view-only'
        })
      ).rejects.toBeInstanceOf(UmamiUserExistsError);
    });

    it('refuses other bad requests', async () => {
      const { client } = setup(text('Password too short', 400));

      await expect(
        client.createUser({
          username: 'a@b.test',
          password: 'x',
          role: 'view-only'
        })
      ).rejects.toMatchObject({ kind: 'refused' });
    });

    it('rejects an answer without an id', async () => {
      const { client } = setup(json({ username: 'a@b.test' }));

      await expect(
        client.createUser({
          username: 'a@b.test',
          password: 'x'.repeat(8),
          role: 'view-only'
        })
      ).rejects.toMatchObject({ kind: 'bad-answer' });
    });

    it('calls a waking Umami unavailable', async () => {
      const { client } = setup(text('', 503));

      await expect(
        client.createUser({
          username: 'a@b.test',
          password: 'x'.repeat(8),
          role: 'view-only'
        })
      ).rejects.toMatchObject({ kind: 'unavailable' });
    });

    it('calls a dropped connection unavailable', async () => {
      const { client } = setup(new Error('socket hang up'));

      await expect(
        client.createUser({
          username: 'a@b.test',
          password: 'x'.repeat(8),
          role: 'view-only'
        })
      ).rejects.toBeInstanceOf(UmamiError);
    });
  });

  describe('getUser', () => {
    it('reads the user', async () => {
      const { fetchImpl, client } = setup(
        json({ id: 'u-1', username: 'ada@b.test', role: 'view-only' })
      );

      await expect(client.getUser('u-1')).resolves.toEqual({
        id: 'u-1',
        username: 'ada@b.test'
      });

      const { url, init } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/users/u-1');
      expect(init?.method).toBe('GET');
    });

    it('throws a not-found error for an unknown user', async () => {
      const { client } = setup(text('', 404));

      await expect(client.getUser('u-1')).rejects.toBeInstanceOf(
        UmamiNotFoundError
      );
    });

    it('throws when the answer has no username', async () => {
      const { client } = setup(json({ id: 'u-1' }));

      await expect(client.getUser('u-1')).rejects.toMatchObject({
        kind: 'bad-answer'
      });
    });

    it('throws when Umami refuses', async () => {
      const { client } = setup(text('', 401));

      await expect(client.getUser('u-1')).rejects.toMatchObject({
        kind: 'refused'
      });
    });
  });

  describe('setPassword', () => {
    it('posts the password to the user', async () => {
      const { fetchImpl, client } = setup(json({ id: 'u-1' }));

      await client.setPassword('u-1', 'new-password');

      const { url, init, body } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/users/u-1');
      expect(init?.method).toBe('POST');
      expect(body).toEqual({ password: 'new-password' });
    });

    it('throws a not-found error for an unknown user', async () => {
      const { client } = setup(text('', 404));

      await expect(
        client.setPassword('u-1', 'x'.repeat(8))
      ).rejects.toBeInstanceOf(UmamiNotFoundError);
    });

    it('throws when Umami refuses', async () => {
      const { client } = setup(text('', 401));

      await expect(
        client.setPassword('u-1', 'x'.repeat(8))
      ).rejects.toMatchObject({
        kind: 'refused'
      });
    });
  });

  describe('addTeamUser', () => {
    it('posts the member with its role', async () => {
      const { fetchImpl, client } = setup(json({}));

      await client.addTeamUser('t-1', 'u-1', 'team-view-only');

      const { url, init, body } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/teams/t-1/users');
      expect(init?.method).toBe('POST');
      expect(body).toEqual({ userId: 'u-1', role: 'team-view-only' });
    });

    it('treats an existing member as done', async () => {
      const { client } = setup(
        text('User is already a member of this team.', 400)
      );

      await expect(
        client.addTeamUser('t-1', 'u-1', 'team-view-only')
      ).resolves.toBeUndefined();
    });

    it('refuses other bad requests', async () => {
      const { client } = setup(text('Invalid role', 400));

      await expect(
        client.addTeamUser('t-1', 'u-1', 'team-view-only')
      ).rejects.toMatchObject({ kind: 'refused' });
    });
  });

  describe('removeTeamUser', () => {
    it('deletes the membership', async () => {
      const { fetchImpl, client } = setup(json({ ok: true }));

      await client.removeTeamUser('t-1', 'u-1');

      const { url, init } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/teams/t-1/users/u-1');
      expect(init?.method).toBe('DELETE');
      expect(init?.body).toBeUndefined();
    });

    it('treats a missing membership as done', async () => {
      const { client } = setup(text('', 404));

      await expect(
        client.removeTeamUser('t-1', 'u-1')
      ).resolves.toBeUndefined();
    });

    it('treats a non-member as done, as Umami words it', async () => {
      const { client } = setup(
        text(
          '{"error":{"message":"The User does not exists on this team."}}',
          400
        )
      );

      await expect(
        client.removeTeamUser('t-1', 'u-1')
      ).resolves.toBeUndefined();
    });

    it('throws on another 400', async () => {
      const { client } = setup(text('{"error":{"message":"Bad"}}', 400));

      await expect(client.removeTeamUser('t-1', 'u-1')).rejects.toBeInstanceOf(
        UmamiError
      );
    });

    it('throws on other failures', async () => {
      const { client } = setup(text('', 500));

      await expect(client.removeTeamUser('t-1', 'u-1')).rejects.toBeInstanceOf(
        UmamiError
      );
    });
  });

  describe('deleteUser', () => {
    it('deletes the user', async () => {
      const { fetchImpl, client } = setup(json({ ok: true }));

      await client.deleteUser('u-1');

      const { url, init } = call(fetchImpl);
      expect(url).toBe('https://umami.test/api/users/u-1');
      expect(init?.method).toBe('DELETE');
    });

    it('treats a missing user as done', async () => {
      const { client } = setup(text('', 404));

      await expect(client.deleteUser('u-1')).resolves.toBeUndefined();
    });

    it('throws on other failures', async () => {
      const { client } = setup(text('', 403));

      await expect(client.deleteUser('u-1')).rejects.toMatchObject({
        kind: 'refused'
      });
    });
  });
});
