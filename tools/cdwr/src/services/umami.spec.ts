import { pickShare } from '../commands/tenant/provision.logic';

import {
  addTeamUser,
  createTeam,
  createWebsite,
  getTeam,
  getWebsite,
  listShares,
  listTeamUsers,
  listTeamWebsites,
  newShareSlug,
  readUmamiProvisioning,
  setShare,
  transferWebsite,
  whoAmI
} from './umami';

vi.mock('./shell', () => ({ sleep: () => Promise.resolve() }));

const state = vi.hoisted(() => ({
  read: (
    _environment: string,
    _path: string
  ): Promise<Record<string, string>> => Promise.resolve({})
}));
vi.mock('./infisical', () => ({
  readSecrets: (environment: string, path: string) =>
    state.read(environment, path)
}));
vi.mock('@codeware/shared/feature/infisical', () => ({
  isNotFound: (error: unknown) =>
    (error as { statusCode?: number }).statusCode === 404
}));

const conn = { url: 'https://umami.test/', apiKey: 'secret-key' };
const site = { id: 'w1', name: 'Acme', domain: 'acme.se', teamId: null };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('readUmamiProvisioning', () => {
  it('is ready when all are set', async () => {
    state.read = async (_env, path): Promise<Record<string, string>> =>
      path === '/apps/cms'
        ? { UMAMI_URL: 'https://umami.test' }
        : { PROVISION_API_KEY: 'k', API_KEY: 'r' };
    expect(await readUmamiProvisioning('production')).toEqual({
      status: 'ready',
      url: 'https://umami.test',
      apiKey: 'k',
      readApiKey: 'r'
    });
  });

  it('names what is missing, including a missing folder', async () => {
    state.read = (_env, path) =>
      path === '/apps/cms'
        ? Promise.resolve({ UMAMI_URL: 'https://umami.test' })
        : Promise.reject(
            Object.assign(new Error('not found'), { statusCode: 404 })
          );
    expect(await readUmamiProvisioning('production')).toEqual({
      status: 'unconfigured',
      missing: ['PROVISION_API_KEY', 'API_KEY']
    });
  });

  it('rethrows other read errors', async () => {
    state.read = () => Promise.reject(new Error('boom'));
    await expect(readUmamiProvisioning('production')).rejects.toThrow('boom');
  });
});

describe('Umami client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gets a website with a bearer key', async () => {
    fetchMock.mockResolvedValue(reply(site));
    expect(await getWebsite(conn, 'w1')).toEqual(site);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/websites/w1');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer secret-key',
      Accept: 'application/json'
    });
  });

  it.each([404, 401, 403])(
    'answers null for a website Umami answers %i to',
    async (status) => {
      fetchMock.mockResolvedValue(reply({}, status));
      expect(await getWebsite(conn, 'w1')).toBeNull();
    }
  );

  it('answers null for an empty body', async () => {
    fetchMock.mockResolvedValue(reply(null, 200));
    expect(await getWebsite(conn, 'w1')).toBeNull();
  });

  it('pages through the team websites', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ data: [site], count: 2, page: 1, pageSize: 1 })
      )
      .mockResolvedValueOnce(
        reply({
          data: [{ ...site, id: 'w2' }],
          count: 2,
          page: 2,
          pageSize: 1
        })
      );
    const all = await listTeamWebsites(conn, 'team');
    expect(all.map(({ id }) => id)).toEqual(['w1', 'w2']);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://umami.test/api/teams/team/websites?page=1&pageSize=100'
    );
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
  });

  it('creates a website in the team', async () => {
    fetchMock.mockResolvedValue(reply(site));
    const created = await createWebsite(conn, {
      name: 'Acme',
      domain: 'acme.se',
      teamId: 'team'
    });
    expect(created).toEqual(site);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/websites');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Acme',
      domain: 'acme.se',
      teamId: 'team'
    });
  });

  it('reports the status without the key', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'nope' }, 403));
    const error = await createWebsite(conn, {
      name: 'a',
      domain: 'b',
      teamId: 't'
    }).catch((e: Error) => e);
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('lists the slugs of a website', async () => {
    fetchMock.mockResolvedValue(
      reply({ data: [{ id: 's1', slug: 'abc' }], count: 1 })
    );
    expect(await listShares(conn, 'w1')).toEqual(['abc']);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://umami.test/api/websites/w1/shares?page=1&pageSize=100'
    );
  });

  it('reads every page of shares', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      slug: `slug${i}`
    }));
    fetchMock
      .mockResolvedValueOnce(reply({ data: first, count: 101 }))
      .mockResolvedValueOnce(
        reply({ data: [{ id: 'last', slug: 'recorded' }], count: 101 })
      );
    const slugs = await listShares(conn, 'w1');
    expect(slugs).toHaveLength(101);
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    expect(pickShare(slugs, 'recorded')).toBe('recorded');
  });

  it('refuses a failed share list', async () => {
    fetchMock.mockResolvedValue(reply({}, 500));
    await expect(listShares(conn, 'w1')).rejects.toThrow('500');
  });

  it('sets a share and answers its slug', async () => {
    fetchMock.mockResolvedValue(reply({ ...site, shareId: 'abc' }));
    expect(await setShare(conn, 'w1', 'abc')).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/websites/w1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ shareId: 'abc' });
  });

  it('surfaces a taken slug with its status', async () => {
    fetchMock.mockResolvedValue(
      new Response('That share ID is already taken.', { status: 400 })
    );
    const error = await setShare(conn, 'w1', 'abc').catch((e: Error) => e);
    expect((error as Error).message).toContain('400');
    expect((error as Error).message).toContain('already taken');
  });

  it('fails on an answer without a share', async () => {
    fetchMock.mockResolvedValue(reply({ ...site, shareId: null }));
    await expect(setShare(conn, 'w1', 'abc')).rejects.toThrow(
      'without a share'
    );
  });

  it('makes 16 alphanumeric characters, differing per call', () => {
    const slug = newShareSlug();
    expect(slug).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(newShareSlug()).not.toBe(slug);
  });
});

describe('Umami client when the service is waking', () => {
  const fetchMock = vi.fn();
  const timeout = () =>
    Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retries once after a timeout', async () => {
    const onWaking = vi.fn();
    fetchMock
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(reply(site));
    expect(await getWebsite({ ...conn, onWaking }, 'w1')).toEqual(site);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onWaking).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 503', async () => {
    const onWaking = vi.fn();
    fetchMock
      .mockResolvedValueOnce(reply({}, 503))
      .mockResolvedValueOnce(reply(site));
    expect(await getWebsite({ ...conn, onWaking }, 'w1')).toEqual(site);
    expect(onWaking).toHaveBeenCalledTimes(1);
  });

  it('gives up after six timeouts, saying waking once', async () => {
    const onWaking = vi.fn();
    fetchMock.mockRejectedValue(timeout());
    await expect(getWebsite({ ...conn, onWaking }, 'w1')).rejects.toThrow(
      'timed out'
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(onWaking).toHaveBeenCalledTimes(1);
  });

  it('retries when the body drops after the headers arrived', async () => {
    const dropped = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'));
        }
      }),
      { status: 200 }
    );
    fetchMock.mockResolvedValueOnce(dropped).mockResolvedValueOnce(reply(site));
    expect(await getWebsite(conn, 'w1')).toEqual(site);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a write', async () => {
    fetchMock.mockRejectedValue(timeout());
    await expect(setShare(conn, 'w1', 'abcdefghijklmnop')).rejects.toThrow(
      'timed out'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 401', async () => {
    const onWaking = vi.fn();
    fetchMock.mockResolvedValue(reply({}, 401));
    expect(await getWebsite({ ...conn, onWaking }, 'w1')).toBeNull();
    await expect(
      createWebsite(
        { ...conn, onWaking },
        { name: 'A', domain: 'a.se', teamId: 't' }
      )
    ).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onWaking).not.toHaveBeenCalled();
  });

  it('reads the team of a website', async () => {
    fetchMock.mockResolvedValue(reply({ ...site, teamId: 'team' }));
    expect((await getWebsite(conn, 'w1'))?.teamId).toBe('team');
  });

  it.each([
    ['flat', { id: 'u1', username: 'admin', role: 'admin' }],
    ['nested', { user: { id: 'u1', username: 'admin', role: 'admin' } }]
  ])('answers who the key is, %s', async (_name, body) => {
    fetchMock.mockResolvedValue(reply(body));
    expect(await whoAmI(conn)).toEqual({
      id: 'u1',
      username: 'admin',
      role: 'admin'
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/me');
    expect(init.method).toBe('GET');
  });

  it('creates a team from the team and membership Umami answers', async () => {
    fetchMock.mockResolvedValue(
      reply([
        { id: 't1', name: 'Acme', extra: 1 },
        { id: 'm1', teamId: 't1', userId: 'u1', role: 'team-owner' }
      ])
    );
    expect(await createTeam(conn, 'Acme')).toEqual({ id: 't1', name: 'Acme' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/teams');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Acme' });
  });

  it('creates a team from a plain object answer', async () => {
    fetchMock.mockResolvedValue(reply({ id: 't1', name: 'Acme', extra: 1 }));
    expect(await createTeam(conn, 'Acme')).toEqual({ id: 't1', name: 'Acme' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/teams');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Acme' });
  });

  it('refuses a team name over 50 characters without calling Umami', async () => {
    await expect(createTeam(conn, 'x'.repeat(51))).rejects.toThrow('50');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a failed team creation', async () => {
    fetchMock.mockResolvedValue(reply({}, 403));
    await expect(createTeam(conn, 'Acme')).rejects.toThrow('403');
  });

  it('adds a user to a team', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await addTeamUser(conn, 't1', 'u1', 'team-view-only');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/teams/t1/users');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      userId: 'u1',
      role: 'team-view-only'
    });
  });

  it('refuses a failed team member', async () => {
    fetchMock.mockResolvedValue(reply({}, 400));
    await expect(addTeamUser(conn, 't1', 'u1', 'team-member')).rejects.toThrow(
      '400'
    );
  });

  it('pages through the users of a team', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          data: [{ id: 'x', userId: 'u1', role: 'team-owner' }],
          count: 2
        })
      )
      .mockResolvedValueOnce(
        reply({
          data: [{ id: 'y', userId: 'u2', role: 'team-view-only' }],
          count: 2
        })
      );
    expect(await listTeamUsers(conn, 't1')).toEqual([
      { userId: 'u1', role: 'team-owner' },
      { userId: 'u2', role: 'team-view-only' }
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://umami.test/api/teams/t1/users?page=1&pageSize=100'
    );
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
  });

  it('reads a team by id and ignores its members', async () => {
    fetchMock.mockResolvedValue(
      reply({ id: 't1', name: 'cdwr-acme', teamUser: [{ userId: 'u1' }] })
    );
    expect(await getTeam(conn, 't1')).toEqual({ id: 't1', name: 'cdwr-acme' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://umami.test/api/teams/t1');
  });

  it('answers null for a team Umami does not know', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'Team not found.' }, 404));
    expect(await getTeam(conn, 'gone')).toBeNull();
  });

  it('refuses other failed team lookups', async () => {
    fetchMock.mockResolvedValue(reply({}, 500));
    await expect(getTeam(conn, 't1')).rejects.toThrow('500');
  });

  it('refuses a failed member list, also a 404', async () => {
    fetchMock.mockResolvedValue(reply({}, 404));
    await expect(listTeamUsers(conn, 'gone')).rejects.toThrow('404');
  });

  it('still refuses other failed member lists', async () => {
    fetchMock.mockResolvedValue(reply({}, 403));
    await expect(listTeamUsers(conn, 't1')).rejects.toThrow('403');
  });

  it('transfers a website to a team', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await transferWebsite(conn, 'w1', 't1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/websites/w1/transfer');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ teamId: 't1' });
  });

  it('refuses a failed transfer', async () => {
    fetchMock.mockResolvedValue(reply({}, 401));
    await expect(transferWebsite(conn, 'w1', 't1')).rejects.toThrow('401');
  });
});
