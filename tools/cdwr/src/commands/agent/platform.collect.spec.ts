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
          return json({
            data:
              params.get('query') === 'is:unresolved'
                ? [
                    { tenant: '', 'count()': 5 },
                    { tenant: 'acme', 'count()': 1 },
                    { tenant: 'beta', 'count()': 0 }
                  ]
                : [
                    { tenant: '', 'count()': 20 },
                    { tenant: null, 'count()': 7 },
                    { tenant: 'acme', 'count()': 3 },
                    { tenant: 'beta', 'count()': 4 }
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
    expect(read.value.day).toEqual({ [SHARED_KEY]: 27, acme: 3, beta: 4 });
    expect(read.value.week).toEqual({
      [SHARED_KEY]: 27,
      acme: 3,
      beta: 4
    });
    expect(read.value.open).toEqual({ [SHARED_KEY]: 5, acme: 1, beta: 0 });
    // Tops follow the open counts: beta has events but none open
    expect(queries.sort()).toEqual([
      'is:unresolved !has:tenant',
      'is:unresolved tenant:acme'
    ]);
    expect(Object.keys(read.value.tops).sort()).toEqual([SHARED_KEY, 'acme']);
  });

  it('reads the open count of the last 24 hours with is:unresolved', async () => {
    const reads: Array<Record<string, string | null>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const params = new URL(url).searchParams;
        if (url.includes('/events/')) {
          reads.push({
            field: params.getAll('field').join(','),
            dataset: params.get('dataset'),
            statsPeriod: params.get('statsPeriod'),
            query: params.get('query')
          });
          return json({ data: [] });
        }
        return json([]);
      })
    );

    await readSentry(env);
    expect(reads).toHaveLength(3);
    expect(reads).toContainEqual({
      field: 'tenant,count()',
      dataset: 'errors',
      statsPeriod: '24h',
      query: 'is:unresolved'
    });
    expect(reads.filter((r) => r['query'] === null)).toHaveLength(2);
  });
});
