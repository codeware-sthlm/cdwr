import { describe, expect, it } from 'vitest';

import { MAIN, domain, flag, flyApp, shared, tenant } from './fixtures';
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

  it('parses the database of the shared row', () => {
    const row = parseTenantRow(shared());
    expect(row.key).toBe(SHARED_KEY);
    expect(row.db).toEqual({
      sizeBytes: 120 * 2 ** 20,
      sessions: 5,
      byApplication: { 'cdwr-cms': 3 }
    });
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
