import { pickShare } from '../commands/tenant/provision.logic';

import {
  addTeamUser,
  createTeam,
  createWebsite,
  getTeam,
  getWebsite,
  listShares,
  listTeamWebsites,
  listUsers,
  loginToken,
  newShareSlug,
  readUmamiProvisioning,
  setShare
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
      authorization: 'Bearer secret-key',
      accept: 'application/json'
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

  it('refuses a team name over 50 characters without calling Umami', async () => {
    await expect(createTeam(conn, 'x'.repeat(51))).rejects.toThrow('50');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('words a refused team call with its status and the body, as before', async () => {
    fetchMock.mockImplementation(
      async () => new Response('Team name taken', { status: 400 })
    );
    await expect(createTeam(conn, 'Acme')).rejects.toThrow(
      'Umami refused the team creation: 400 Team name taken'
    );
    await expect(getTeam(conn, 't1')).rejects.toThrow(
      'Umami refused the team lookup: 400 Team name taken'
    );
  });

  it('words a waking write as a refusal, with the body', async () => {
    fetchMock.mockImplementation(
      async () => new Response('Bad gateway', { status: 502 })
    );
    await expect(addTeamUser(conn, 't1', 'u1', 'team-member')).rejects.toThrow(
      'Umami refused the team member: 502 Bad gateway'
    );
    await expect(
      createWebsite(conn, { name: 'A', domain: 'a.se', teamId: 't' })
    ).rejects.toThrow('Umami refused the website creation: 502 Bad gateway');
    await expect(setShare(conn, 'w1', 'abc')).rejects.toThrow(
      'Umami refused the share creation: 502 Bad gateway'
    );
  });

  it('says Umami kept answering while waking when a read runs out of retries', async () => {
    fetchMock.mockImplementation(async () => reply({}, 503));
    await expect(getTeam(conn, 't1')).rejects.toThrow(
      'Umami answered 503 while waking up'
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('makes team and user calls with the key, as the shared calls', async () => {
    fetchMock.mockResolvedValue(reply({ id: 't1', name: 'Acme' }));
    expect(await createTeam(conn, 'Acme')).toEqual({ id: 't1', name: 'Acme' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/teams');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer secret-key');
  });

  it('retries a team read while waking, but not a team write', async () => {
    const onWaking = vi.fn();
    fetchMock
      .mockResolvedValueOnce(reply({}, 503))
      .mockResolvedValueOnce(reply({ id: 't1', name: 'cdwr-acme' }));
    expect(await getTeam({ ...conn, onWaking }, 't1')).toEqual({
      id: 't1',
      name: 'cdwr-acme'
    });
    expect(onWaking).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(reply({}, 503));
    await expect(addTeamUser(conn, 't1', 'u1', 'team-member')).rejects.toThrow(
      '503'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lists users with a login token, not the key', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ data: [{ id: 'u1', username: 'ann', role: 'user' }], count: 1 })
    );
    expect(await listUsers(conn, 'login-token')).toEqual([
      { id: 'u1', username: 'ann' }
    ]);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(
      'Bearer login-token'
    );
  });
});

describe('loginToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the credentials and returns the token', async () => {
    fetchMock.mockResolvedValue(reply({ token: 'tok', user: { id: 'a' } }));

    expect(await loginToken('https://umami.test/', 'admin', 'pw')).toBe('tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://umami.test/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      username: 'admin',
      password: 'pw'
    });
  });

  it('says so for a user with 2FA', async () => {
    fetchMock.mockResolvedValue(
      reply({ requiresTwoFactor: true, partialToken: 'p' })
    );

    await expect(loginToken('https://umami.test', 'a', 'pw')).rejects.toThrow(
      /has 2FA/
    );
  });

  it('fails with the status and never the password', async () => {
    fetchMock.mockResolvedValue(reply({}, 401));

    const attempt = loginToken('https://umami.test', 'a', 'pw-secret');
    await expect(attempt).rejects.toThrow('Umami refused the login: 401');
    await expect(attempt).rejects.not.toThrow(/pw-secret/);
  });
});
