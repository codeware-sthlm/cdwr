import { readDeploy, readSentry } from './platform.collect';
import { SHARED_KEY } from './platform.logic';

const env = { PLATFORM_SENTRY_AUTH_TOKEN: 'tok', PLATFORM_SENTRY_ORG: 'cdwr' };

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body)));

describe('readSentry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds up events without a tenant tag on the shared key and queries their top issue by !has:tenant', async () => {
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const params = new URL(url).searchParams;
        if (url.includes('/events/')) {
          expect(params.get('query')).toBeNull();
          return json({
            data: [
              { tenant: '', 'count()': 20 },
              { tenant: null, 'count()': 7 },
              { tenant: 'acme', 'count()': 3 }
            ]
          });
        }
        queries.push(params.get('query') ?? '');
        return json([
          { shortId: 'CDWR-1', level: 'error', count: '5', title: 'Boom' }
        ]);
      })
    );

    const read = await readSentry(env);
    if (!read.ok) throw new Error('expected an ok read');
    expect(read.value.day).toEqual({ [SHARED_KEY]: 27, acme: 3 });
    expect(read.value.week).toEqual({ [SHARED_KEY]: 27, acme: 3 });
    expect(queries.sort()).toEqual([
      'is:unresolved !has:tenant',
      'is:unresolved tenant:acme'
    ]);
    expect(Object.keys(read.value.tops).sort()).toEqual([SHARED_KEY, 'acme']);
  });
});

describe('readDeploy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // Both GitHub reads answer; the headers each one was sent are kept
  const stubGithub = () => {
    const headers: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        headers.push(init.headers as Record<string, string>);
        return url.includes('/jobs')
          ? json({ jobs: [{ name: 'deploy', conclusion: 'success' }] })
          : json({
              workflow_runs: [
                {
                  id: 7,
                  head_sha: 'abc',
                  html_url: 'https://github.test/run/7',
                  updated_at: '2026-11-21T00:00:00Z'
                }
              ]
            });
      })
    );
    return headers;
  };

  it('reads as the app when given its token', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'app-token');
    const headers = stubGithub();
    expect((await readDeploy()).ok).toBe(true);
    expect(headers).toHaveLength(2);
    for (const h of headers)
      expect(h['Authorization']).toBe('Bearer app-token');
  });

  it('reads anonymously without a token', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const headers = stubGithub();
    expect((await readDeploy()).ok).toBe(true);
    for (const h of headers) expect(h).not.toHaveProperty('Authorization');
  });
});
