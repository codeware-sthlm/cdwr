import { describe, expect, it, vi } from 'vitest';

import {
  UmamiNotFoundError,
  UmamiUserExistsError,
  createUmamiAdminClient
} from './umami-admin-client';
import { UmamiError } from './umami-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const text = (body: string, status: number) => new Response(body, { status });

const setup = (response: Response | Error) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  const client = createUmamiAdminClient({
    baseUrl: 'https://umami.test/',
    apiKey: 'admin-key',
    fetchImpl
  });
  return { fetchImpl, client };
};

const call = (fetchImpl: ReturnType<typeof setup>['fetchImpl']) => {
  const [url, init] = fetchImpl.mock.calls[0] ?? [];
  return {
    url: String(url),
    init,
    body: init?.body ? JSON.parse(String(init.body)) : undefined
  };
};

describe('createUmamiAdminClient', () => {
  describe('createUser', () => {
    it('posts the user with the admin key and returns it', async () => {
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
        authorization: 'Bearer admin-key',
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
