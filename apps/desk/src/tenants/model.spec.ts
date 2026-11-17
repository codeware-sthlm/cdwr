import { describe, expect, it } from 'vitest';

import type { Json } from '../supabase.types';

import {
  MAIN,
  deployRun,
  domain,
  flag,
  flyApp,
  sentry,
  shared,
  tenant,
  topIssue,
  visitors
} from './fixtures';
import { SHARED_KEY, parseTenantRow } from './model';

describe('parseTenantRow', () => {
  it('parses the columns the NUC writes', () => {
    const row = parseTenantRow(tenant('acme'));
    expect(row.key).toBe('acme');
    expect(row.name).toBe('ACME');
    expect(Number.isFinite(row.at)).toBe(true);
    expect(row.apps.map((a) => [a.app, a.kind])).toEqual([
      ['cdwr-cms-acme', 'cms'],
      ['cdwr-headless-acme', 'headless']
    ]);
    expect(row.apps[0].machines?.[0]).toEqual({
      id: 'm1',
      state: 'started',
      region: 'arn',
      memoryMb: 512,
      image: 'registry.fly.io/cdwr:deployment-1',
      sha: MAIN
    });
    expect(row.apps[0].health).toEqual({ ok: true, status: 200, ms: 120 });
    expect(row.domains).toEqual([
      {
        hostname: 'acme.example.com',
        app: 'cdwr-cms-acme',
        primary: true,
        certificate: 'Ready'
      }
    ]);
    expect(row.switches).toEqual([
      { app: 'cms', environment: 'production', tenant: 'acme', flag: 'on' }
    ]);
    expect(row.db).toBeNull();
  });

  it('reads gated as a boolean, else as unknown', () => {
    const row = parseTenantRow(
      tenant('acme', {
        apps: [
          flyApp('cdwr-cms-acme', 'cms', { gated: true }),
          flyApp('cdwr-headless-acme', 'headless', { gated: false }),
          flyApp('cdwr-builder', 'builder', { gated: 'yes' }),
          flyApp('cdwr-umami', 'umami')
        ]
      })
    );
    expect(row.apps.map((a) => a.gated)).toEqual([true, false, null, null]);
  });

  it('parses the database of the shared row', () => {
    const row = parseTenantRow(shared());
    expect(row.key).toBe(SHARED_KEY);
    expect(row.db).toEqual({
      sizeBytes: 120 * 2 ** 20,
      sessions: 5,
      pooler: 3,
      byApplication: { 'cdwr-cms': 3 }
    });
  });

  it('reads a database row written before the pooler count as no pooler figure', () => {
    const row = parseTenantRow(
      shared({ db: { sizeBytes: null, sessions: 14, byApplication: {} } })
    );
    expect(row.db).toMatchObject({ sessions: 14, pooler: null });
  });

  it('reads a read that failed as null, not as empty', () => {
    const row = parseTenantRow(
      tenant('acme', {
        apps: [flyApp('cdwr-cms-acme', 'cms', { machines: null, certs: null })],
        errors: { fly: 'cdwr-cms-acme: unauthorized' }
      })
    );
    expect(row.apps[0].machines).toBeNull();
    expect(row.apps[0].certs).toBeNull();
    expect(row.errors).toEqual({ fly: 'cdwr-cms-acme: unauthorized' });
  });

  it('survives columns of another shape', () => {
    const row = parseTenantRow({
      key: 'odd',
      at: 'not a time',
      name: null,
      deployment: null,
      status: null,
      apps: [
        'x',
        { app: 7 },
        { app: 'cdwr-cms-odd', machines: 'none', health: { ok: 'yes' } },
        {
          app: 'cdwr-headless-odd',
          kind: 'headless',
          machines: [{ id: 1, sha: 5 }, 'x'],
          health: { ok: false, status: 'x', ms: null }
        }
      ],
      domains: [
        { primary: true },
        domain('odd.example.com', { certificate: 3 })
      ],
      switches: [flag('odd', 'on'), { app: 'cms' }, null],
      db: { sessions: 'many' },
      errors: { fly: 'down', switches: 4 }
    });
    expect(Number.isNaN(row.at)).toBe(true);
    expect(row.apps).toHaveLength(2);
    expect(row.apps[0]).toMatchObject({
      app: 'cdwr-cms-odd',
      kind: 'other',
      machines: null,
      health: null
    });
    expect(row.apps[1].machines).toEqual([
      {
        id: '',
        state: 'unknown',
        region: '',
        memoryMb: null,
        image: null,
        sha: null
      }
    ]);
    expect(row.apps[1].health).toEqual({ ok: false, status: null, ms: null });
    expect(row.domains).toEqual([
      {
        hostname: 'odd.example.com',
        app: 'cdwr-cms-acme',
        primary: true,
        certificate: 'unknown'
      }
    ]);
    expect(row.switches).toHaveLength(1);
    expect(row.db).toBeNull();
    expect(row.errors).toEqual({ fly: 'down' });
  });

  it('parses the sentry, visitors and deploy columns and the apps behind flag', () => {
    const row = parseTenantRow(
      tenant('acme', {
        apps: [
          flyApp('a', 'cms', { behind: true }),
          flyApp('b', 'headless', { behind: null }),
          flyApp('c', 'cms', { behind: 'yes' })
        ],
        sentry: sentry({ top: topIssue() }),
        visitors: visitors()
      })
    );
    expect(row.apps.map((a) => a.behind)).toEqual([true, null, null]);
    expect(row.sentry).toEqual({
      org: 'cdwr',
      count24h: 2,
      count7d: 14,
      top: {
        shortId: 'CMS-4F',
        level: 'error',
        count: 31,
        title: 'TypeError: x is undefined'
      }
    });
    expect(row.visitors?.today).toBe(12);
    expect(row.visitors?.days).toHaveLength(7);
    expect(row.visitors?.days[0]).toEqual({ date: '2026-11-08', visitors: 8 });
    expect(row.deploy).toBeNull();
    expect(
      parseTenantRow(shared({ deploy: deployRun() })).deploy
    ).toMatchObject({ runId: 4242, conclusion: 'success' });
  });

  it('reads the empty column of a row without such data as absent', () => {
    const row = parseTenantRow(tenant('acme'));
    expect(row.sentry).toBeNull();
    expect(row.visitors).toBeNull();
    expect(row.deploy).toBeNull();
  });

  it('reads malformed sentry, visitors and deploy columns as absent', () => {
    const odd = (over: Record<string, Json>) =>
      parseTenantRow(tenant('acme', over));
    expect(odd({ sentry: [1], visitors: 'x', deploy: 4 })).toMatchObject({
      sentry: null,
      visitors: null,
      deploy: null
    });
    expect(odd({ sentry: sentry({ count24h: 'many' }) }).sentry).toBeNull();
    expect(odd({ sentry: sentry({ org: 'a.b/c' }) }).sentry).toBeNull();
    expect(odd({ sentry: sentry({ top: { shortId: 3 } }) }).sentry?.top).toBe(
      null
    );
    expect(odd({ visitors: { today: 'x' } }).visitors).toBeNull();
    expect(
      odd({
        visitors: {
          today: 3,
          days: [{ date: 1, visitors: 2 }, { date: 'd', visitors: 'x' }, 'z']
        }
      }).visitors
    ).toEqual({ today: 3, days: [] });
    expect(odd({ deploy: { runId: 'x', conclusion: 'failure' } }).deploy).toBe(
      null
    );
    expect(odd({ deploy: { runId: 1 } }).deploy).toBeNull();
  });

  it('reads json that is not a list or a record as empty', () => {
    const row = parseTenantRow({
      ...tenant('acme'),
      apps: 'x',
      domains: null,
      switches: 3,
      db: [1],
      errors: ['x']
    });
    expect(row).toMatchObject({
      apps: [],
      domains: [],
      switches: [],
      db: null,
      errors: {}
    });
  });
});
