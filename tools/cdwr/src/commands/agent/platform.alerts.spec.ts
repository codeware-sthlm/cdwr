import type { TenantRow } from '@codeware/shared/util/platform-problems';

import {
  type PlatformAlerts,
  alertsToRaise,
  parseRows,
  urgentProblems
} from './platform.alerts';
import type { TenantStateRow } from './platform.logic';
import type { Json } from './supabase.types';

const AT = '2026-11-22T10:00:00.000Z';
const NOW = Date.parse(AT);
const EARLIER = '2026-11-22T08:00:00.000Z';

const app = (name: string, status: number | null) => ({
  app: name,
  kind: 'cms',
  machines: [{ id: 'm1', state: 'started', region: 'arn' }],
  certs: [],
  health: { ok: status === 200, status, ms: 20 }
});

const issue = (shortId: string) => ({
  shortId,
  level: 'error',
  title: 'Boom',
  firstSeen: '2026-11-22T09:30:00Z'
});

type Over = Partial<TenantStateRow>;

const stateRow = (key: string, over: Over = {}): TenantStateRow => ({
  key,
  at: AT,
  name: key,
  deployment: key,
  status: 'active',
  apps: [],
  domains: [],
  switches: [],
  sentry: {},
  errors: {},
  ...over
});

const rowsOf = (...rows: TenantStateRow[]): TenantRow[] => parseRows(rows);

const sentryWith = (fresh: Json) => ({
  org: 'cdwr',
  count24h: 1,
  open24h: 1,
  count7d: 1,
  top: null,
  fresh
});

const told = (at = EARLIER) => ({ at, sent: true });
const pending = (at = EARLIER) => ({ at, sent: false });

const raise = (
  previous: PlatformAlerts | null,
  rows: TenantRow[],
  tenantsRead = true
) => alertsToRaise(previous, urgentProblems(rows, NOW), rows, AT, tenantsRead);

const downRows = (status: number | null = 502) =>
  rowsOf(stateRow('demo', { apps: [app('cdwr-cms-demo', status)] }));

describe('alertsToRaise', () => {
  it('seeds the first run silently with every urgent problem as sent', () => {
    const rows = rowsOf(
      stateRow('demo', {
        apps: [app('cdwr-cms-demo', 502)],
        sentry: sentryWith([issue('CMS-12')])
      })
    );
    const { notices, next } = raise(null, rows);
    expect(notices).toEqual([]);
    expect(next).toEqual({
      'demo:down:cdwr-cms-demo': { at: AT, sent: true },
      'new-issue:CMS-12': { at: AT, sent: true }
    });
  });

  it('stores a down app on its first tick without a notice', () => {
    const { notices, next } = raise({}, downRows());
    expect(notices).toEqual([]);
    expect(next).toEqual({ 'demo:down:cdwr-cms-demo': pending(AT) });
  });

  it('sends the notice for a down app on the second consecutive tick, naming only the app and the answer', () => {
    const { notices, next } = raise(
      { 'demo:down:cdwr-cms-demo': pending() },
      downRows()
    );
    expect(notices).toEqual([
      {
        key: 'demo:down:cdwr-cms-demo',
        text: 'Platform: cdwr-cms-demo is down · Health check answered 502'
      }
    ]);
    expect(next).toEqual({ 'demo:down:cdwr-cms-demo': pending() });
  });

  it('does not send a down app that dipped for one tick and came back', () => {
    const healthy = rowsOf(
      stateRow('demo', { apps: [app('cdwr-cms-demo', 200)] })
    );
    const first = raise({}, downRows());
    const cleared = raise(first.next, healthy);
    expect(cleared.next).toEqual({});
    expect(raise(cleared.next, downRows()).notices).toEqual([]);
  });

  it('sends a new Sentry issue on the first tick, with id, level and url but no title', () => {
    const rows = rowsOf(
      stateRow('demo', { sentry: sentryWith([issue('CMS-12')]) })
    );
    const { notices, next } = raise({}, rows);
    expect(notices).toEqual([
      {
        key: 'new-issue:CMS-12',
        text: 'Platform: new Sentry issue on production in demo · CMS-12 · error https://cdwr.sentry.io/issues/?query=CMS-12'
      }
    ]);
    expect(notices[0]?.text).not.toContain('Boom');
    expect(next).toEqual({ 'new-issue:CMS-12': pending(AT) });
  });

  it('names the host apps for an issue of the shared row', () => {
    const rows = rowsOf(
      stateRow('_shared', { sentry: sentryWith([issue('CMS-1')]) })
    );
    expect(raise({}, rows).notices[0]?.text).toContain(
      'in the host apps · CMS-1'
    );
  });

  it('tries an unsent key again on the next tick', () => {
    const rows = rowsOf(
      stateRow('demo', { sentry: sentryWith([issue('CMS-12')]) })
    );
    const again = raise({ 'new-issue:CMS-12': pending() }, rows);
    expect(again.notices).toHaveLength(1);
    expect(again.next).toEqual({ 'new-issue:CMS-12': pending() });
  });

  it('carries a key already told, with its first time and no notice', () => {
    const { notices, next } = raise(
      { 'demo:down:cdwr-cms-demo': told() },
      downRows()
    );
    expect(notices).toEqual([]);
    expect(next).toEqual({ 'demo:down:cdwr-cms-demo': told() });
  });

  it('drops a key that cleared, so its return starts over', () => {
    const healthy = rowsOf(
      stateRow('demo', { apps: [app('cdwr-cms-demo', 200)] })
    );
    const cleared = raise({ 'demo:down:cdwr-cms-demo': told() }, healthy);
    expect(cleared.next).toEqual({});
    expect(cleared.notices).toEqual([]);
    expect(raise(cleared.next, downRows()).next).toEqual({
      'demo:down:cdwr-cms-demo': pending(AT)
    });
  });

  it('keeps a down key while the fly read failed, since the apps read as none', () => {
    const rows = rowsOf(stateRow('demo', { errors: { fly: 'fly failed' } }));
    const previous = { 'demo:down:cdwr-cms-demo': told() };
    const { notices, next } = raise(previous, rows);
    expect(next).toEqual(previous);
    expect(notices).toEqual([]);
  });

  it('keeps a new-issue key while any row had a sentry error', () => {
    const previous = { 'new-issue:CMS-12': told() };
    const rows = rowsOf(
      stateRow('a', { sentry: sentryWith(null) }),
      stateRow('b', { errors: { sentry: 'sentry failed' } })
    );
    expect(raise(previous, rows).next).toEqual(previous);
  });

  it('keeps a new-issue key while a row read no new issues', () => {
    const previous = { 'new-issue:CMS-12': told() };
    const rows = rowsOf(
      stateRow('a', { errors: { sentry: 'top issue: x; new issues: y' } })
    );
    expect(raise(previous, rows).next).toEqual(previous);
  });

  it('drops a new-issue key when only a top issue read failed', () => {
    const rows = rowsOf(
      stateRow('a', {
        sentry: sentryWith([]),
        errors: { sentry: 'top issue: 502' }
      })
    );
    expect(raise({ 'new-issue:CMS-12': told() }, rows).next).toEqual({});
  });

  it('groups a new-issue problem without a ref by the id in its key', () => {
    const rows = rowsOf(stateRow('a'));
    const problem = {
      key: 'a:new-issue:CMS-12',
      row: 'a',
      kind: 'new-issue' as const,
      severity: 'warn' as const,
      title: 'New Sentry issue CMS-12',
      evidence: [],
      threshold: '',
      actions: []
    };
    const previous = { 'a:new-issue:CMS-12': told() };
    const { notices, next } = alertsToRaise(
      previous,
      [problem],
      rows,
      AT,
      true
    );
    expect(notices).toEqual([]);
    expect(next).toEqual({ 'new-issue:CMS-12': told() });
  });

  it('keeps a new-issue key when the tenants were not read', () => {
    const previous = { 'new-issue:CMS-12': told() };
    expect(raise(previous, rowsOf(stateRow('a')), false).next).toEqual(
      previous
    );
  });

  it('drops a new-issue key once the issue is gone, also from rows with no fresh read', () => {
    const rows = rowsOf(
      stateRow('a', { sentry: sentryWith([]) }),
      stateRow('b', { sentry: sentryWith(null) }),
      stateRow('c')
    );
    expect(raise({ 'new-issue:CMS-12': told() }, rows).next).toEqual({});
  });

  it('sends one notice for an issue seen in several rows, naming them', () => {
    const fresh = sentryWith([issue('CMS-12')]);
    const rows = rowsOf(
      stateRow('_shared', { sentry: fresh }),
      stateRow('b', { sentry: fresh }),
      stateRow('a', { sentry: fresh })
    );
    const { notices, next } = raise({}, rows);
    expect(notices).toEqual([
      {
        key: 'new-issue:CMS-12',
        text: 'Platform: new Sentry issue on production in a, b and the host apps · CMS-12 · error https://cdwr.sentry.io/issues/?query=CMS-12'
      }
    ]);
    expect(next).toEqual({ 'new-issue:CMS-12': pending(AT) });
  });

  it('folds older per-row keys, all sent, into one key with the earliest time and no notice', () => {
    const fresh = sentryWith([issue('CMS-12')]);
    const rows = rowsOf(
      stateRow('a', { sentry: fresh }),
      stateRow('b', { sentry: fresh })
    );
    const { notices, next } = raise(
      {
        'a:new-issue:CMS-12': told('2026-11-22T09:00:00.000Z'),
        'b:new-issue:CMS-12': told(EARLIER)
      },
      rows
    );
    expect(notices).toEqual([]);
    expect(next).toEqual({ 'new-issue:CMS-12': told(EARLIER) });
  });

  it('counts an issue as sent when one of its older per-row keys was', () => {
    const fresh = sentryWith([issue('CMS-12')]);
    const rows = rowsOf(
      stateRow('a', { sentry: fresh }),
      stateRow('b', { sentry: fresh })
    );
    const { notices, next } = raise(
      { 'a:new-issue:CMS-12': pending(), 'b:new-issue:CMS-12': told(AT) },
      rows
    );
    expect(notices).toEqual([]);
    expect(next).toEqual({ 'new-issue:CMS-12': told(EARLIER) });
  });

  it('drops the keys of a row that is gone when the tenants were read', () => {
    expect(
      raise({ 'gone:down:cdwr-cms-gone': told() }, downRows()).next
    ).not.toHaveProperty('gone:down:cdwr-cms-gone');
  });

  it('keeps the keys of a missing row when the tenants were not read', () => {
    const previous = { 'gone:down:cdwr-cms-gone': told() };
    expect(raise(previous, downRows(), false).next).toHaveProperty(
      'gone:down:cdwr-cms-gone',
      told()
    );
  });

  it('ignores problems that are not urgent', () => {
    const rows = rowsOf(
      stateRow('demo', {
        apps: [{ ...app('cdwr-cms-demo', 200), behind: true }]
      })
    );
    expect(raise({}, rows)).toEqual({ notices: [], next: {} });
  });
});
