import { readSentry } from './platform.collect';
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
