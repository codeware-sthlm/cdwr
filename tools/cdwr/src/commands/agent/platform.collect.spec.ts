import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { notifyEnv, readSentry, sendNotice } from './platform.collect';
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
    const fresh: Array<Record<string, string | null>> = [];
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
        if (params.get('sort') === 'new') {
          fresh.push({
            query: params.get('query'),
            sort: params.get('sort'),
            limit: params.get('limit')
          });
          return json([
            {
              shortId: 'CDWR-2',
              level: 'warning',
              title: 'New',
              firstSeen: '2026-11-22T09:30:00Z'
            }
          ]);
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
    // The new issues follow the same rows, first seen first, 25 at most, error or fatal on production
    const base =
      'is:unresolved age:-24h environment:production level:[error,fatal]';
    expect(fresh.map((f) => f['query']).sort()).toEqual([
      `${base} !has:tenant`,
      `${base} tenant:acme`
    ]);
    expect(fresh.every((f) => f['sort'] === 'new' && f['limit'] === '25')).toBe(
      true
    );
    expect(Object.keys(read.value.fresh).sort()).toEqual([SHARED_KEY, 'acme']);
    expect(read.value.fresh['acme']).toEqual({
      ok: true,
      value: [
        {
          shortId: 'CDWR-2',
          level: 'warning',
          title: 'New',
          firstSeen: '2026-11-22T09:30:00Z'
        }
      ]
    });
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

  it('reads a failed new-issues query as a failed reading of that tenant only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const params = new URL(url).searchParams;
        if (url.includes('/events/')) {
          return json({
            data:
              params.get('query') === 'is:unresolved'
                ? [{ tenant: 'acme', 'count()': 1 }]
                : []
          });
        }
        if (params.get('sort') === 'new') {
          return Promise.resolve(new Response('no', { status: 500 }));
        }
        return json([]);
      })
    );
    const read = await readSentry(env);
    if (!read.ok) throw new Error('expected an ok read');
    expect(read.value.fresh['acme']).toMatchObject({
      ok: false,
      reason: 'Sentry answered 500'
    });
    expect(read.value.tops['acme']?.ok).toBe(true);
  });
});

describe('sendNotice', () => {
  it('runs notify.sh with only what it reads, none of the collector credentials', async () => {
    const home = mkdtempSync(join(tmpdir(), 'notify-'));
    const script = join(home, 'notify.sh');
    writeFileSync(script, `#!/bin/sh\nenv > "${home}/seen.env"\n`);
    chmodSync(script, 0o755);
    const sent = await sendNotice(
      {
        PATH: process.env['PATH'],
        HOME: '/home/x',
        AGENT_QUEUE_HOME: home,
        SLACK_WEBHOOK_URL: 'https://hooks.example/x',
        FLY_API_TOKEN: 'fly-secret',
        PLATFORM_DATABASE_URL: 'postgres://u:pw@db/cms',
        PLATFORM_SENTRY_AUTH_TOKEN: 'sentry-secret',
        AGENT_SUPABASE_SERVICE_KEY: 'sb-secret'
      },
      'Platform: x'
    );
    expect(sent).toBe(true);
    const seen = readFileSync(join(home, 'seen.env'), 'utf8');
    expect(seen).toContain(`AGENT_QUEUE_HOME=${home}`);
    expect(seen).toContain('SLACK_WEBHOOK_URL=');
    expect(seen).not.toMatch(/FLY_API_TOKEN|PLATFORM_|sb-secret|fly-secret/);
  });

  it('picks only the variables notify.sh reads', () => {
    expect(
      notifyEnv({ PATH: '/bin', FLY_API_TOKEN: 't', AGENT_QUEUE_HOME: '/q' })
    ).toEqual({ PATH: '/bin', AGENT_QUEUE_HOME: '/q' });
  });
});
