import { describe, expect, it, vi } from 'vitest';

import { UmamiNotFoundError, UmamiUserExistsError } from './errors';
import { createUmamiCalls } from './umami-calls';
import { type UmamiRequest, umamiFetch } from './umami-fetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const text = (body: string, status: number) => new Response(body, { status });

/** Calls answered one response at a time, the last one repeating */
const setup = (...responses: Array<Response | Error>) => {
  const queue = [...responses];
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (next instanceof Error) throw next;
    return next.clone();
  });
  const request: UmamiRequest = (init) =>
    umamiFetch({
      ...init,
      url: 'https://umami.test/',
      auth: { token: 'login-token' },
      timeoutMs: 5000,
      fetchImpl
    });
  return { fetchImpl, calls: createUmamiCalls(request) };
};

const sent = (fetchImpl: ReturnType<typeof setup>['fetchImpl'], index = 0) => {
  const [url, init] = fetchImpl.mock.calls[index] ?? [];
  return {
    url: String(url),
    method: init?.method,
    headers: init?.headers,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    rawBody: init?.body
  };
};

const newUser = {
  username: 'a@b.test',
  password: 'x'.repeat(8),
  role: 'view-only'
} as const;

describe('createUser', () => {
  it('posts the user and returns it', async () => {
    const { fetchImpl, calls } = setup(
      json({ id: 'u-1', username: 'a@b.test', role: 'view-only' })
    );

    await expect(calls.createUser(newUser)).resolves.toEqual({
      id: 'u-1',
      username: 'a@b.test'
    });

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/users');
    expect(call.method).toBe('POST');
    expect(call.headers).toMatchObject({
      authorization: 'Bearer login-token',
      'content-type': 'application/json'
    });
    expect(call.body).toEqual(newUser);
  });

  it('surfaces a taken username as its own error', async () => {
    const { calls } = setup(text('User already exists', 400));

    await expect(calls.createUser(newUser)).rejects.toBeInstanceOf(
      UmamiUserExistsError
    );
  });

  it('refuses other bad requests', async () => {
    const { calls } = setup(text('Password too short', 400));

    await expect(calls.createUser(newUser)).rejects.toMatchObject({
      kind: 'refused'
    });
  });

  it('rejects an answer without an id', async () => {
    const { calls } = setup(json({ username: 'a@b.test' }));

    await expect(calls.createUser(newUser)).rejects.toMatchObject({
      kind: 'bad-answer'
    });
  });

  it('calls a waking Umami unavailable', async () => {
    const { calls } = setup(text('', 503));

    await expect(calls.createUser(newUser)).rejects.toMatchObject({
      kind: 'unavailable'
    });
  });

  it('calls a dropped connection unavailable', async () => {
    const { calls } = setup(new Error('socket hang up'));

    await expect(calls.createUser(newUser)).rejects.toMatchObject({
      name: 'UmamiError',
      kind: 'unavailable'
    });
  });
});

describe('getUser', () => {
  it('reads the user', async () => {
    const { fetchImpl, calls } = setup(
      json({ id: 'u-1', username: 'ada@b.test', role: 'view-only' })
    );

    await expect(calls.getUser('u-1')).resolves.toEqual({
      id: 'u-1',
      username: 'ada@b.test'
    });
    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/users/u-1');
    expect(call.method).toBe('GET');
  });

  it('throws a not-found error for an unknown user', async () => {
    const { calls } = setup(text('', 404));

    await expect(calls.getUser('u-1')).rejects.toBeInstanceOf(
      UmamiNotFoundError
    );
  });

  it('throws when the answer has no username', async () => {
    const { calls } = setup(json({ id: 'u-1' }));

    await expect(calls.getUser('u-1')).rejects.toMatchObject({
      kind: 'bad-answer'
    });
  });

  it('throws when Umami refuses', async () => {
    const { calls } = setup(text('', 401));

    await expect(calls.getUser('u-1')).rejects.toMatchObject({
      kind: 'refused'
    });
  });
});

describe('setPassword', () => {
  it('posts the password to the user', async () => {
    const { fetchImpl, calls } = setup(json({ id: 'u-1' }));

    await calls.setPassword('u-1', 'new-password');

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/users/u-1');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ password: 'new-password' });
  });

  it('throws a not-found error for an unknown user', async () => {
    const { calls } = setup(text('', 404));

    await expect(calls.setPassword('u-1', 'x')).rejects.toBeInstanceOf(
      UmamiNotFoundError
    );
  });

  it('throws when Umami refuses', async () => {
    const { calls } = setup(text('', 401));

    await expect(calls.setPassword('u-1', 'x')).rejects.toMatchObject({
      kind: 'refused'
    });
  });
});

describe('deleteUser', () => {
  it('deletes the user', async () => {
    const { fetchImpl, calls } = setup(json({ ok: true }));

    await calls.deleteUser('u-1');

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/users/u-1');
    expect(call.method).toBe('DELETE');
  });

  it('treats a missing user as done', async () => {
    const { calls } = setup(text('', 404));

    await expect(calls.deleteUser('u-1')).resolves.toBeUndefined();
  });

  it('throws on other failures', async () => {
    const { calls } = setup(text('', 403));

    await expect(calls.deleteUser('u-1')).rejects.toMatchObject({
      kind: 'refused'
    });
  });
});

describe('listUsers', () => {
  it('reads the admin user list as a token holder', async () => {
    const { fetchImpl, calls } = setup(
      json({ data: [{ id: 'u1', username: 'ann', role: 'user' }], count: 1 })
    );

    await expect(calls.listUsers()).resolves.toEqual([
      { id: 'u1', username: 'ann' }
    ]);
    const call = sent(fetchImpl);
    expect(call.url).toBe(
      'https://umami.test/api/admin/users?page=1&pageSize=100'
    );
    expect(call.headers).toMatchObject({ authorization: 'Bearer login-token' });
  });

  it('refuses a failed list', async () => {
    const { calls } = setup(json({}, 403));

    await expect(calls.listUsers()).rejects.toThrow('403');
  });
});

describe('whoAmI', () => {
  it.each([
    ['flat', { id: 'u1', username: 'admin', role: 'admin' }],
    ['nested', { user: { id: 'u1', username: 'admin', role: 'admin' } }]
  ])('answers who the user is, %s', async (_name, body) => {
    const { fetchImpl, calls } = setup(json(body));

    await expect(calls.whoAmI()).resolves.toEqual({
      id: 'u1',
      username: 'admin',
      role: 'admin'
    });
    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/me');
    expect(call.method).toBe('GET');
  });

  it('refuses a failed lookup', async () => {
    const { calls } = setup(json({}, 401));

    await expect(calls.whoAmI()).rejects.toThrow('401');
  });
});

describe('teams', () => {
  it('creates a team from the team and membership Umami answers', async () => {
    const { fetchImpl, calls } = setup(
      json([
        { id: 't1', name: 'Acme', extra: 1 },
        { id: 'm1', teamId: 't1', userId: 'u1', role: 'team-owner' }
      ])
    );

    await expect(calls.createTeam('Acme')).resolves.toEqual({
      id: 't1',
      name: 'Acme'
    });
    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/teams');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ name: 'Acme' });
  });

  it('creates a team from a plain object answer', async () => {
    const { calls } = setup(json({ id: 't1', name: 'Acme', extra: 1 }));

    await expect(calls.createTeam('Acme')).resolves.toEqual({
      id: 't1',
      name: 'Acme'
    });
  });

  it('refuses a failed team creation', async () => {
    const { calls } = setup(json({}, 403));

    await expect(calls.createTeam('Acme')).rejects.toThrow('403');
  });

  it('reads a team by id and ignores its members', async () => {
    const { fetchImpl, calls } = setup(
      json({ id: 't1', name: 'cdwr-acme', teamUser: [{ userId: 'u1' }] })
    );

    await expect(calls.getTeam('t1')).resolves.toEqual({
      id: 't1',
      name: 'cdwr-acme'
    });
    expect(sent(fetchImpl).url).toBe('https://umami.test/api/teams/t1');
  });

  it('answers null for a team Umami does not know', async () => {
    const { calls } = setup(json({ error: 'Team not found.' }, 404));

    await expect(calls.getTeam('gone')).resolves.toBeNull();
  });

  it('refuses other failed team lookups', async () => {
    const { calls } = setup(json({}, 500));

    await expect(calls.getTeam('t1')).rejects.toThrow('500');
  });

  it('lists teams', async () => {
    const { fetchImpl, calls } = setup(
      json({ data: [{ id: 't1', name: 'cdwr-acme' }], count: 1 })
    );

    await expect(calls.listTeams()).resolves.toEqual([
      { id: 't1', name: 'cdwr-acme' }
    ]);
    expect(sent(fetchImpl).url).toBe(
      'https://umami.test/api/teams?page=1&pageSize=100'
    );
  });

  it('pages through the users of a team', async () => {
    const { fetchImpl, calls } = setup(
      json({
        data: [{ id: 'x', userId: 'u1', role: 'team-owner' }],
        count: 2
      }),
      json({
        data: [{ id: 'y', userId: 'u2', role: 'team-view-only' }],
        count: 2
      })
    );

    await expect(calls.listTeamUsers('t1')).resolves.toEqual([
      { userId: 'u1', role: 'team-owner' },
      { userId: 'u2', role: 'team-view-only' }
    ]);
    expect(sent(fetchImpl).url).toBe(
      'https://umami.test/api/teams/t1/users?page=1&pageSize=100'
    );
    expect(sent(fetchImpl, 1).url).toContain('page=2');
  });

  it('stops paging on an empty page', async () => {
    const { fetchImpl, calls } = setup(json({ data: [], count: 5 }));

    await expect(calls.listTeams()).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a failed member list, also a 404', async () => {
    const { calls } = setup(json({}, 404));

    await expect(calls.listTeamUsers('gone')).rejects.toThrow('404');
  });
});

describe('addTeamUser', () => {
  it('posts the member with its role', async () => {
    const { fetchImpl, calls } = setup(json({}));

    await calls.addTeamUser('t-1', 'u-1', 'team-view-only');

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/teams/t-1/users');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ userId: 'u-1', role: 'team-view-only' });
  });

  it('treats an existing member as done', async () => {
    const { calls } = setup(
      text('User is already a member of this team.', 400)
    );

    await expect(
      calls.addTeamUser('t-1', 'u-1', 'team-view-only')
    ).resolves.toBeUndefined();
  });

  it('refuses other bad requests', async () => {
    const { calls } = setup(text('Invalid role', 400));

    await expect(
      calls.addTeamUser('t-1', 'u-1', 'team-view-only')
    ).rejects.toMatchObject({ kind: 'refused' });
  });
});

describe('removeTeamUser', () => {
  it('deletes the membership', async () => {
    const { fetchImpl, calls } = setup(json({ ok: true }));

    await calls.removeTeamUser('t-1', 'u-1');

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/teams/t-1/users/u-1');
    expect(call.method).toBe('DELETE');
    expect(call.rawBody).toBeUndefined();
  });

  it('treats a missing membership as done', async () => {
    const { calls } = setup(text('', 404));

    await expect(calls.removeTeamUser('t-1', 'u-1')).resolves.toBeUndefined();
  });

  it('treats a non-member as done, as Umami words it', async () => {
    const { calls } = setup(
      text(
        '{"error":{"message":"The User does not exists on this team."}}',
        400
      )
    );

    await expect(calls.removeTeamUser('t-1', 'u-1')).resolves.toBeUndefined();
  });

  it('throws on another 400', async () => {
    const { calls } = setup(text('{"error":{"message":"Bad"}}', 400));

    await expect(calls.removeTeamUser('t-1', 'u-1')).rejects.toMatchObject({
      kind: 'refused'
    });
  });

  it('throws on other failures', async () => {
    const { calls } = setup(text('', 500));

    await expect(calls.removeTeamUser('t-1', 'u-1')).rejects.toMatchObject({
      name: 'UmamiError'
    });
  });
});

describe('transferWebsite', () => {
  it('transfers a website to a team', async () => {
    const { fetchImpl, calls } = setup(json({ ok: true }));

    await calls.transferWebsite('w1', 't1');

    const call = sent(fetchImpl);
    expect(call.url).toBe('https://umami.test/api/websites/w1/transfer');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ teamId: 't1' });
  });

  it('refuses a failed transfer', async () => {
    const { calls } = setup(json({}, 401));

    await expect(calls.transferWebsite('w1', 't1')).rejects.toThrow('401');
  });
});
