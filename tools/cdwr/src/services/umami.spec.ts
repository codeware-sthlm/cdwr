import {
  createWebsite,
  getWebsite,
  listShares,
  listTeamWebsites,
  newShareSlug,
  readUmamiProvisioning,
  setShare
} from './umami';

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
const site = { id: 'w1', name: 'Acme', domain: 'acme.se' };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('readUmamiProvisioning', () => {
  it('is ready when all three are set', async () => {
    state.read = async (_env, path): Promise<Record<string, string>> =>
      path === '/apps/cms'
        ? { UMAMI_URL: 'https://umami.test' }
        : { PROVISION_API_KEY: 'k', TEAM_ID: 't' };
    expect(await readUmamiProvisioning('production')).toEqual({
      status: 'ready',
      url: 'https://umami.test',
      apiKey: 'k',
      teamId: 't'
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
      missing: ['PROVISION_API_KEY', 'TEAM_ID']
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
