import {
  SupabaseApiError,
  accessToken,
  createSecretKey,
  decodeKeychain,
  deleteApiKey,
  keyHash,
  listApiKeys,
  projectRef
} from './supabase-management';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const answer = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('keyHash', () => {
  it('is base64url sha256 without padding', () => {
    // sha256("abc")
    expect(keyHash('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});

describe('decodeKeychain', () => {
  it("undoes go-keyring's base64 prefix", () => {
    const encoded = `go-keyring-base64:${Buffer.from('sbp_token').toString('base64')}\n`;
    expect(decodeKeychain(encoded)).toBe('sbp_token');
  });

  it('keeps a plain value', () => {
    expect(decodeKeychain('sbp_token\n')).toBe('sbp_token');
  });
});

describe('projectRef', () => {
  it('reads the ref from the project url', () => {
    expect(projectRef('https://abcdefghijklmnopqrst.supabase.co/')).toBe(
      'abcdefghijklmnopqrst'
    );
  });

  it('refuses another host', () => {
    expect(() => projectRef('https://example.com')).toThrow(
      'not a <ref>.supabase.co address'
    );
  });
});

describe('accessToken', () => {
  it('takes SUPABASE_ACCESS_TOKEN first', async () => {
    await expect(
      accessToken({ SUPABASE_ACCESS_TOKEN: ' sbp_x ' }, 'linux')
    ).resolves.toBe('sbp_x');
  });

  it('fails without one off a Mac', async () => {
    await expect(accessToken({}, 'linux')).rejects.toThrow('supabase login');
  });
});

describe('the API', () => {
  it('lists keys unrevealed with the token as bearer', async () => {
    fetchMock.mockResolvedValue(
      answer(200, [{ id: 'k', name: 'default', type: 'secret', hash: 'h' }])
    );
    await expect(listApiKeys('tok', 'ref')).resolves.toEqual([
      { id: 'k', name: 'default', type: 'secret', hash: 'h' }
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.supabase.com/v1/projects/ref/api-keys?reveal=false'
    );
    expect(init.headers).toEqual({ authorization: 'Bearer tok' });
  });

  it('creates a service_role secret key and returns its value', async () => {
    fetchMock.mockResolvedValue(
      answer(201, { id: 'new', api_key: 'sb_secret_v', name: 'n' })
    );
    await expect(
      createSecretKey('tok', 'ref', { name: 'n', description: 'd' })
    ).resolves.toEqual({ id: 'new', value: 'sb_secret_v' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.supabase.com/v1/projects/ref/api-keys?reveal=true'
    );
    expect(JSON.parse(String(init.body))).toEqual({
      type: 'secret',
      name: 'n',
      description: 'd',
      secret_jwt_template: { role: 'service_role' }
    });
  });

  it('deletes a key by id', async () => {
    fetchMock.mockResolvedValue(answer(200, { id: 'old' }));
    await deleteApiKey('tok', 'ref', 'old');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.supabase.com/v1/projects/ref/api-keys/old');
    expect(init.method).toBe('DELETE');
  });

  it("fails with the API's message, never the token", async () => {
    fetchMock.mockResolvedValue(answer(401, { message: 'Unauthorized' }));
    const error = await listApiKeys('tok', 'ref').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SupabaseApiError);
    expect(String(error)).toBe(
      'SupabaseApiError: Supabase api-key list answered 401: Unauthorized'
    );
  });
});
