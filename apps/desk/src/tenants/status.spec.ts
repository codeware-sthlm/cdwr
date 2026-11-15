import { describe, expect, it } from 'vitest';

import {
  appCell,
  certCell,
  compactLine,
  healthCell,
  sessionsCell,
  switchesCell,
  versionCell
} from './cells';
import {
  BEHIND,
  MAIN,
  NOW,
  domain,
  flag,
  flyApp,
  machine,
  minutesAgo,
  payload,
  shared,
  tenant
} from './fixtures';
import { parseTenantRow } from './model';
import {
  DB_SESSIONS_MAX,
  DB_SESSIONS_WARN,
  TENANTS_STALE_MIN,
  isBehind,
  statusOf,
  tenantsView
} from './status';

const statusFor = (
  over: Parameters<typeof tenant>[1],
  main: string | null = MAIN
) => statusOf(parseTenantRow(tenant('acme', over)), main);

describe('thresholds', () => {
  it('names the limits', () => {
    expect(DB_SESSIONS_MAX).toBe(15);
    expect(DB_SESSIONS_WARN).toBe(12);
    expect(TENANTS_STALE_MIN).toBe(30);
  });
});

describe('isBehind', () => {
  it('is behind when the commits differ', () => {
    expect(isBehind(BEHIND, MAIN)).toBe(true);
  });

  it('is not behind on the same commit, abbreviated or not', () => {
    expect(isBehind(MAIN, MAIN)).toBe(false);
    expect(isBehind(MAIN.slice(0, 7), MAIN)).toBe(false);
    expect(isBehind(MAIN, MAIN.slice(0, 7))).toBe(false);
  });

  it('is not behind when either commit is unknown', () => {
    expect(isBehind(null, MAIN)).toBe(false);
    expect(isBehind(BEHIND, null)).toBe(false);
  });
});

describe('statusOf', () => {
  it('is ok for a healthy tenant on main with a switch on', () => {
    expect(statusFor({})).toBe('ok');
  });

  it('is down when an app health check fails', () => {
    expect(
      statusFor({
        apps: [
          flyApp('cdwr-cms-acme', 'cms'),
          flyApp('cdwr-headless-acme', 'headless', {
            health: { ok: false, status: 503, ms: 90 }
          })
        ]
      })
    ).toBe('down');
  });

  it('is warn when a machine is behind main', () => {
    expect(
      statusFor({
        apps: [
          flyApp('cdwr-cms-acme', 'cms', {
            machines: [machine({ sha: BEHIND })]
          })
        ]
      })
    ).toBe('warn');
  });

  it('is not warn for a machine with no known commit, or without main', () => {
    const apps = [
      flyApp('cdwr-cms-acme', 'cms', { machines: [machine({ sha: null })] })
    ];
    expect(statusFor({ apps })).toBe('ok');
    expect(
      statusFor(
        {
          apps: [
            flyApp('cdwr-cms-acme', 'cms', {
              machines: [machine({ sha: BEHIND })]
            })
          ]
        },
        null
      )
    ).toBe('ok');
  });

  it('is warn when a certificate is not ready, not when it is unknown', () => {
    expect(
      statusFor({
        domains: [
          domain('acme.example.com', { certificate: 'Awaiting configuration' })
        ]
      })
    ).toBe('warn');
    expect(
      statusFor({
        domains: [domain('acme.example.com', { certificate: 'missing' })]
      })
    ).toBe('warn');
    expect(
      statusFor({
        domains: [domain('acme.example.com', { certificate: 'unknown' })]
      })
    ).toBe('ok');
    expect(
      statusFor({
        domains: [domain('acme.example.com', { certificate: 'ready' })]
      })
    ).toBe('ok');
  });

  it('warns the shared row from 12 database sessions', () => {
    const at = (sessions: number) =>
      statusOf(
        parseTenantRow(
          shared({ db: { sizeBytes: null, sessions, byApplication: {} } })
        ),
        MAIN
      );
    expect(at(DB_SESSIONS_WARN - 1)).toBe('ok');
    expect(at(DB_SESSIONS_WARN)).toBe('warn');
    expect(at(DB_SESSIONS_MAX)).toBe('warn');
  });

  it('is off when no switch of the tenant is on', () => {
    expect(statusFor({ switches: [flag('acme', 'off')] })).toBe('off');
    expect(statusFor({ switches: [] })).toBe('off');
    expect(
      statusFor({
        switches: [flag('acme', 'off'), flag('acme', 'on', 'headless')]
      })
    ).toBe('ok');
  });

  it('is not off when the switches were not read', () => {
    expect(
      statusFor({ switches: [], errors: { switches: 'infisical unreachable' } })
    ).toBe('ok');
  });

  it('never calls the shared row off', () => {
    expect(statusOf(parseTenantRow(shared({ switches: [] })), MAIN)).toBe('ok');
  });

  it('ranks down over warn over off', () => {
    const off = { switches: [flag('acme', 'off')] };
    const behind = {
      apps: [
        flyApp('cdwr-cms-acme', 'cms', { machines: [machine({ sha: BEHIND })] })
      ]
    };
    const failing = {
      apps: [
        flyApp('cdwr-cms-acme', 'cms', {
          health: { ok: false, status: 500, ms: 1 }
        })
      ]
    };
    expect(statusFor({ ...off, ...behind })).toBe('warn');
    expect(statusFor({ ...off, ...failing })).toBe('down');
    expect(statusFor({ ...behind, ...failing })).toBe('down');
  });
});

describe('tenantsView', () => {
  it('is loading before the read and empty without a row', () => {
    expect(tenantsView(null, NOW)).toEqual({ kind: 'loading' });
    expect(tenantsView(payload([]), NOW)).toEqual({ kind: 'empty' });
  });

  it('lists the tenants by slug and the shared row apart', () => {
    const v = tenantsView(
      payload([shared(), tenant('zed'), tenant('acme')]),
      NOW
    );
    if (v.kind !== 'ready') throw new Error('not ready');
    expect(v.tenants.map((e) => e.row.key)).toEqual(['acme', 'zed']);
    expect(v.shared?.row.key).toBe('_shared');
    expect(v.main).toBe(MAIN);
  });

  it('takes the worst status of every row, the shared one too', () => {
    const v = tenantsView(
      payload([
        tenant('acme'),
        shared({ db: { sizeBytes: null, sessions: 13, byApplication: {} } })
      ]),
      NOW
    );
    expect(v).toMatchObject({ kind: 'ready', worst: 'warn' });
  });

  it('does not let an off tenant colour the rest', () => {
    const off = tenant('zed', { switches: [flag('zed', 'off')] });
    expect(tenantsView(payload([tenant('acme'), off]), NOW)).toMatchObject({
      worst: 'ok'
    });
    expect(tenantsView(payload([off]), NOW)).toMatchObject({ worst: 'off' });
  });

  it('is stale once the newest row is older than 30 minutes', () => {
    const at = (min: number) =>
      tenantsView(
        payload([
          tenant('acme', { at: minutesAgo(min + 20) }),
          tenant('zed', { at: minutesAgo(min) })
        ]),
        NOW
      );
    expect(at(TENANTS_STALE_MIN)).toMatchObject({ stale: false, ageMin: 30 });
    expect(at(TENANTS_STALE_MIN + 1)).toMatchObject({
      stale: true,
      ageMin: 31
    });
  });

  it('is stale when no time parses', () => {
    expect(
      tenantsView(payload([tenant('acme', { at: 'never' })]), NOW)
    ).toMatchObject({ stale: true, ageMin: null });
  });
});

describe('cells', () => {
  const row = (over: Parameters<typeof tenant>[1] = {}) =>
    parseTenantRow(tenant('acme', over));

  it('shows an app by its health, or a dash', () => {
    expect(appCell(row(), 'cms')).toEqual({ text: 'ok', tone: 'ok' });
    expect(appCell(row({ apps: [] }), 'cms')).toEqual({
      text: '–',
      tone: 'muted'
    });
    expect(
      appCell(
        row({
          apps: [
            flyApp('cdwr-cms-acme', 'cms', {
              health: { ok: false, status: 500, ms: 1 }
            })
          ]
        }),
        'cms'
      )
    ).toEqual({ text: 'down', tone: 'bad' });
    expect(
      appCell(
        row({ apps: [flyApp('cdwr-cms-acme', 'cms', { health: null })] }),
        'cms'
      )
    ).toEqual({ text: 'unknown', tone: 'muted' });
  });

  it('shows the version against main', () => {
    expect(versionCell(row(), MAIN)).toEqual({ text: 'current', tone: 'ok' });
    expect(
      versionCell(
        row({
          apps: [
            flyApp('cdwr-cms-acme', 'cms', {
              machines: [machine({ sha: BEHIND })]
            })
          ]
        }),
        MAIN
      )
    ).toEqual({ text: 'behind', tone: 'wait' });
    expect(versionCell(row(), null)).toEqual({
      text: 'aaaaaaa',
      tone: 'muted'
    });
    expect(
      versionCell(
        row({
          apps: [
            flyApp('cdwr-cms-acme', 'cms', {
              machines: [machine({ sha: null })]
            })
          ]
        }),
        MAIN
      )
    ).toEqual({ text: '–', tone: 'muted' });
  });

  it('counts the failing health checks', () => {
    expect(healthCell(row())).toEqual({ text: 'ok', tone: 'ok' });
    expect(
      healthCell(
        row({
          apps: [
            flyApp('cdwr-cms-acme', 'cms', {
              health: { ok: false, status: 500, ms: 1 }
            }),
            flyApp('cdwr-headless-acme', 'headless', {
              health: { ok: false, status: 0, ms: 1 }
            })
          ]
        })
      )
    ).toEqual({ text: '2 failing', tone: 'bad' });
    expect(healthCell(row({ apps: [] }))).toEqual({ text: '–', tone: 'muted' });
  });

  it('shows the certificates', () => {
    expect(certCell(row())).toEqual({ text: 'ready', tone: 'ok' });
    expect(
      certCell(
        row({
          domains: [
            domain('a.example.com', { certificate: 'missing' }),
            domain('b.example.com')
          ]
        })
      )
    ).toEqual({ text: '1 not ready', tone: 'wait' });
    expect(
      certCell(
        row({ domains: [domain('a.example.com', { certificate: 'unknown' })] })
      )
    ).toEqual({ text: 'unknown', tone: 'muted' });
    expect(certCell(row({ domains: [] }))).toEqual({
      text: '–',
      tone: 'muted'
    });
  });

  it('shows the shared sessions against the limit, a tenant its own by app name', () => {
    const sharedRow = parseTenantRow(shared());
    expect(sessionsCell(sharedRow, sharedRow.db)).toEqual({
      text: '5 of 15',
      tone: 'ok'
    });
    const busy = parseTenantRow(
      shared({ db: { sizeBytes: null, sessions: 12, byApplication: {} } })
    );
    expect(sessionsCell(busy, busy.db).tone).toBe('wait');
    const full = parseTenantRow(
      shared({ db: { sizeBytes: null, sessions: 15, byApplication: {} } })
    );
    expect(sessionsCell(full, full.db).tone).toBe('bad');
    const db = {
      sizeBytes: null,
      sessions: 5,
      byApplication: { 'cdwr-cms-acme': 2, 'cdwr-headless-acme': 1 }
    };
    expect(sessionsCell(row(), db)).toEqual({ text: '3', tone: 'muted' });
    expect(sessionsCell(row(), null)).toEqual({ text: '–', tone: 'muted' });
  });

  it('counts the switches on and off', () => {
    expect(switchesCell(row())).toEqual({ text: '1 on', tone: 'ok' });
    expect(
      switchesCell(
        row({ switches: [flag('acme', 'on'), flag('acme', 'off', 'headless')] })
      )
    ).toEqual({ text: '1 on · 1 off', tone: 'ok' });
    expect(switchesCell(row({ switches: [flag('acme', 'off')] }))).toEqual({
      text: '0 on · 1 off',
      tone: 'muted'
    });
    expect(switchesCell(row({ switches: [] }))).toEqual({
      text: '–',
      tone: 'muted'
    });
  });

  it('names the apps in the compact line', () => {
    expect(compactLine(row(), MAIN)).toBe(
      'cms ok · headless ok · version current'
    );
    expect(compactLine(row({ apps: [] }), MAIN)).toBe('');
  });
});
