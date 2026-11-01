import { describe, expect, it } from 'vitest';

import type {
  GithubEventRow,
  HostMetricRow,
  RunsPayload,
  SessionRow
} from '../supabase';

import {
  HOST_METRICS_MINUTES,
  HOST_SPACING_SAMPLES,
  SESSION_HANDBACK_MIN
} from './constants';
import {
  type HostSessions,
  type Problem,
  agentPrs,
  feed,
  frozenAt,
  handBack,
  health,
  hostSessions,
  prState,
  problemKey,
  problems,
  pulse,
  sampleMinutes,
  silentAfter
} from './live';
import type { Connection } from './state';
import type { QueueView, SessionState } from './types';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const MIN = 6e4;

/** The ISO time `min` minutes before NOW */
const ago = (min: number): string =>
  new Date(NOW.getTime() - min * MIN).toISOString();

const connection = (over: Partial<Connection> = {}): Connection => ({
  live: true,
  retries: 0,
  upSince: NOW.getTime() - 60 * MIN,
  downSince: null,
  status: null,
  nextAt: null,
  lastIssue: null,
  ...over
});

const event = (over: Partial<GithubEventRow> = {}): GithubEventRow => ({
  subject: 'pull/10',
  pr: 10,
  action: 'pull_request:opened',
  updated_at: ago(5),
  ...over
});

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 's1',
  host: 'mac',
  kind: 'attended',
  last_seen: ago(1),
  ...over
});

const GIB = 2 ** 30;

const sample = (min: number): HostMetricRow => ({
  id: 1,
  host: 'nuc',
  at: ago(min),
  cores: 4,
  load1: 1,
  load5: 1,
  load15: 1,
  mem_total: 8 * GIB,
  mem_available: 6 * GIB,
  swap_total: 2 * GIB,
  swap_free: 2 * GIB,
  disk_total: 100 * GIB,
  disk_free: 60 * GIB,
  cgroup_mem_current: null,
  cgroup_mem_max: null
});

const run = (
  started: string,
  finished: string | null = started
): RunsPayload['rows'][number] => ({
  when: '',
  outcome: 'implemented',
  ticket: '',
  detail: '',
  started,
  finished
});

const goodView = (
  at: string,
  session: SessionState = { state: 'none' }
): QueueView => ({
  at,
  limit: { used: 0, max: 5 },
  session,
  next: [],
  held: { tickets: [], free: [] },
  parked: [],
  table: { before: [], label: [], after: [] }
});

const runs = (
  at: string,
  rows: RunsPayload['rows'] = [],
  viewInvalid = false
): RunsPayload => ({
  last: null,
  attended: null,
  suggested: null,
  job: null,
  qv: null,
  viewInvalid,
  view: null,
  viewIssues: [],
  at,
  main: { image: null, desk: null },
  rows
});

describe('prState', () => {
  it.each([
    ['pull_request:opened', 'checks running'],
    ['pull_request:reopened', 'checks running'],
    ['pull_request:synchronize', 'checks running'],
    ['pull_request:ready_for_review', 'checks running'],
    ['pull_request:review_requested', 'review requested'],
    ['pull_request:enqueued', 'in merge queue'],
    ['pull_request:dequeued', 'left merge queue'],
    ['pull_request:merged', 'merged'],
    ['pull_request:closed', 'closed'],
    ['check_suite:success', 'checks passed'],
    ['check_suite:neutral', 'checks passed'],
    ['check_suite:skipped', 'checks passed'],
    ['check_suite:failure', 'checks failed'],
    ['check_suite:timed_out', 'checks failed'],
    ['check_suite:cancelled', 'checks finished'],
    ['check_suite:stale', 'checks finished'],
    ['check_suite:completed', 'checks finished'],
    ['pull_request_review:copilot', 'Copilot reviewed'],
    ['pull_request_review:submitted', 'reviewed'],
    ['pull_request_review_comment:created', 'reviewed']
  ])('%s -> %s', (action, state) => {
    expect(prState(action)).toBe(state);
  });

  it.each([
    'push',
    'pull_request:labeled',
    'pull_request',
    'check_suite',
    'issues:opened',
    ''
  ])('does not know %j', (action) => {
    expect(prState(action)).toBeNull();
  });
});

describe('agentPrs', () => {
  const tickets = new Map([
    [10, 'COD-1'],
    [11, 'COD-2']
  ]);
  const title = (id: string): string => `Title of ${id}`;

  it('is empty without events', () => {
    expect(agentPrs(null, tickets, title)).toEqual([]);
    expect(agentPrs([], tickets, title)).toEqual([]);
  });

  it('drops events without a PR or a ticket for it', () => {
    const out = agentPrs(
      [
        event({ pr: null, subject: 'branch/x' }),
        event({ pr: 99, subject: 'pull/99' }),
        event({ pr: 10 })
      ],
      tickets,
      title
    );
    expect(out.map((p) => p.pr)).toEqual([10]);
  });

  it('takes the title from the callback and lists the newest event first', () => {
    const out = agentPrs(
      [
        event({
          pr: 10,
          action: 'pull_request:opened',
          updated_at: ago(30)
        }),
        event({
          pr: 11,
          subject: 'pull/11',
          action: 'check_suite:success',
          updated_at: ago(5)
        })
      ],
      tickets,
      title
    );
    expect(out).toEqual([
      {
        pr: 11,
        ticket: 'COD-2',
        title: 'Title of COD-2',
        state: 'checks passed',
        action: 'check_suite:success',
        at: NOW.getTime() - 5 * MIN
      },
      {
        pr: 10,
        ticket: 'COD-1',
        title: 'Title of COD-1',
        state: 'checks running',
        action: 'pull_request:opened',
        at: NOW.getTime() - 30 * MIN
      }
    ]);
  });

  it('keeps an action the desk does not know, without a state', () => {
    const out = agentPrs([event({ action: 'push' })], tickets, title);
    expect(out[0]).toMatchObject({ state: null, action: 'push' });
  });
});

describe('sampleMinutes', () => {
  it('falls back without two samples', () => {
    expect(sampleMinutes([])).toBe(HOST_METRICS_MINUTES);
    expect(sampleMinutes([sample(0)])).toBe(HOST_METRICS_MINUTES);
    // Two samples at the same instant have no spacing
    expect(sampleMinutes([sample(3), sample(3)])).toBe(HOST_METRICS_MINUTES);
  });

  it('is the median of the spacings', () => {
    expect(sampleMinutes([sample(20), sample(10), sample(0)])).toBeCloseTo(10);
    // Spacings 1 and 2 minutes
    expect(sampleMinutes([sample(3), sample(2), sample(0)])).toBeCloseTo(1.5);
    // Spacings 1, 1 and 8: the odd one out does not count
    expect(
      sampleMinutes([sample(10), sample(9), sample(8), sample(0)])
    ).toBeCloseTo(1);
  });

  it('does not depend on the order of the rows', () => {
    expect(sampleMinutes([sample(0), sample(20), sample(10)])).toBeCloseTo(10);
  });

  it('reads only the newest samples', () => {
    // An old stretch at 10 minutes, then one-minute samples
    const old = Array.from({ length: 6 }, (_, i) => sample(200 - i * 10));
    const recent = Array.from({ length: HOST_SPACING_SAMPLES + 1 }, (_, i) =>
      sample(HOST_SPACING_SAMPLES - i)
    );
    expect(sampleMinutes([...old, ...recent])).toBeCloseTo(1);
  });
});

describe('silentAfter', () => {
  it('is three intervals', () => {
    expect(silentAfter(10)).toBe(30);
    expect(silentAfter(1)).toBe(3);
  });
});

describe('hostSessions', () => {
  it('is empty without rows', () => {
    expect(hostSessions(null, NOW)).toEqual([]);
    expect(hostSessions([], NOW)).toEqual([]);
  });

  it('drops sessions older than the hand-back window', () => {
    const out = hostSessions(
      [
        session({ id: 'a', last_seen: ago(SESSION_HANDBACK_MIN) }),
        session({ id: 'b', last_seen: ago(SESSION_HANDBACK_MIN + 1) })
      ],
      NOW
    );
    expect(out.flatMap((h) => h.sessions.map((s) => s.id))).toEqual(['a']);
  });

  it('groups by host, newest first, with ages in minutes', () => {
    const out = hostSessions(
      [
        session({
          id: 'n1',
          host: 'nuc',
          kind: 'implement',
          last_seen: ago(10)
        }),
        session({ id: 'm1', last_seen: ago(8) }),
        session({ id: 'm2', last_seen: ago(2) })
      ],
      NOW
    );
    expect(out.map((h) => h.host)).toEqual(['mac', 'nuc']);
    expect(out[0].ageMin).toBeCloseTo(2);
    expect(out[0].sessions.map((s) => s.id)).toEqual(['m2', 'm1']);
    expect(out[0].sessions[0]).toMatchObject({ id: 'm2', kind: 'attended' });
    expect(out[0].sessions[0].ageMin).toBeCloseTo(2);
    expect(out[1].ageMin).toBeCloseTo(10);
    expect(out[1].sessions).toHaveLength(1);
  });
});

describe('handBack', () => {
  it('is attended within five minutes of the Mac’s attended heartbeat', () => {
    const h = handBack([session({ last_seen: ago(3) })], 'nuc', true, NOW);
    expect(h).toMatchObject({ state: 'attended', host: 'mac' });
    expect(h.ageMin).toBeCloseTo(3);
    expect(
      handBack([session({ last_seen: ago(5) })], 'nuc', true, NOW).state
    ).toBe('attended');
  });

  it('is handing back within thirty minutes', () => {
    const h = handBack([session({ last_seen: ago(10) })], 'nuc', true, NOW);
    expect(h).toMatchObject({ state: 'handing back', host: 'mac' });
    expect(
      handBack([session({ last_seen: ago(30) })], 'nuc', true, NOW).state
    ).toBe('handing back');
  });

  it('is decided by the NUC’s heartbeat after that', () => {
    const rows = [session({ last_seen: ago(45) })];
    expect(handBack(rows, 'nuc', true, NOW)).toMatchObject({
      state: 'heartbeat ok',
      host: 'mac'
    });
    expect(handBack(rows, 'nuc', false, NOW).state).toBe('idle');
  });

  it('has no host or age without an attended session', () => {
    expect(handBack(null, 'nuc', true, NOW)).toEqual({
      state: 'heartbeat ok',
      host: null,
      ageMin: null
    });
    expect(handBack([], null, false, NOW).state).toBe('idle');
  });

  it('ignores the NUC’s own attended rows and the implement sessions', () => {
    const h = handBack(
      [
        session({ id: 'a', host: 'nuc', kind: 'attended', last_seen: ago(1) }),
        session({ id: 'b', host: 'mac', kind: 'implement', last_seen: ago(1) })
      ],
      'nuc',
      false,
      NOW
    );
    expect(h).toEqual({ state: 'idle', host: null, ageMin: null });
  });

  it('follows the newest attended heartbeat', () => {
    const h = handBack(
      [
        session({ id: 'a', host: 'old-mac', last_seen: ago(20) }),
        session({ id: 'b', host: 'mac', last_seen: ago(2) })
      ],
      'nuc',
      true,
      NOW
    );
    expect(h).toMatchObject({ state: 'attended', host: 'mac' });
  });
});

describe('pulse', () => {
  it('is null before any event', () => {
    expect(pulse(null, connection())).toBeNull();
    expect(pulse([], connection())).toBeNull();
  });

  it('names a PR as #n with its state', () => {
    expect(
      pulse([event({ pr: 719, action: 'check_suite:success' })], connection())
    ).toEqual({
      subject: '#719',
      what: 'checks passed',
      at: NOW.getTime() - 5 * MIN
    });
  });

  it('names a branch by its subject and an unknown action as it is', () => {
    expect(
      pulse(
        [event({ pr: null, subject: 'branch/x', action: 'push' })],
        connection()
      )
    ).toMatchObject({ subject: 'branch/x', what: 'push' });
  });

  it('takes the newest GitHub event', () => {
    const p = pulse(
      [
        event({ pr: 1, updated_at: ago(20) }),
        event({ pr: 2, updated_at: ago(3) }),
        event({ pr: 3, updated_at: ago(9) })
      ],
      connection()
    );
    expect(p?.subject).toBe('#2');
  });

  it('is the issue event alone without GitHub events', () => {
    const lastIssue = {
      issue_id: 'uuid-1',
      identifier: 'COD-5',
      action: 'update',
      updated_at: ago(2)
    };
    expect(pulse([], connection({ lastIssue }))).toEqual({
      subject: 'COD-5',
      what: 'update',
      at: NOW.getTime() - 2 * MIN
    });
    expect(
      pulse([], connection({ lastIssue: { ...lastIssue, identifier: null } }))
        ?.subject
    ).toBe('uuid-1');
  });

  it('picks the newer of the GitHub event and the issue event', () => {
    const lastIssue = {
      issue_id: 'uuid-1',
      identifier: 'COD-5',
      action: 'update',
      updated_at: ago(2)
    };
    expect(
      pulse([event({ updated_at: ago(5) })], connection({ lastIssue }))?.subject
    ).toBe('COD-5');
    expect(
      pulse([event({ updated_at: ago(1) })], connection({ lastIssue }))?.subject
    ).toBe('#10');
  });

  it('skips an issue event without a time', () => {
    const lastIssue = {
      issue_id: 'uuid-1',
      identifier: 'COD-5',
      action: 'update',
      updated_at: ''
    };
    expect(pulse([event()], connection({ lastIssue }))?.subject).toBe('#10');
    expect(pulse([], connection({ lastIssue }))).toBeNull();
  });
});

describe('feed', () => {
  const lastIssue = {
    issue_id: 'uuid-1',
    identifier: 'COD-5',
    action: 'update',
    updated_at: ago(2)
  };

  it('is empty before any event', () => {
    expect(feed(null, connection())).toEqual([]);
  });

  it('holds the newest of each table, newest first', () => {
    const rows = feed(
      [
        event({ pr: 1, updated_at: ago(9) }),
        event({ pr: 2, updated_at: ago(5) })
      ],
      connection({ lastIssue })
    );
    expect(rows.map((r) => r.subject)).toEqual(['COD-5', '#2']);
    expect(
      feed([event({ updated_at: ago(1) })], connection({ lastIssue })).map(
        (r) => r.subject
      )
    ).toEqual(['#10', 'COD-5']);
  });

  it('holds one row when only one table brought an event', () => {
    expect(feed([], connection({ lastIssue }))).toHaveLength(1);
    expect(feed([event()], connection())).toHaveLength(1);
  });
});

describe('problems', () => {
  const host = {
    host: 'nuc',
    at: NOW.getTime() - 2 * MIN,
    ageMin: 2,
    silentMin: 30
  };
  const base = {
    connection: connection(),
    runs: runs(ago(5), [run(ago(10), ago(8))]),
    runMinutes: 10,
    host,
    sessions: null,
    now: NOW
  };

  it('finds nothing when all is well', () => {
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, runs: null, host: null })).toEqual([]);
  });

  it('says Realtime is down, with the drop count when there is one', () => {
    const none = problems({
      ...base,
      connection: connection({ live: false, downSince: NOW.getTime() - 60e3 })
    });
    expect(none).toHaveLength(1);
    expect(none[0].kind).toBe('connection');
    expect(none[0].text).toContain('not connected');
    const dropped = problems({
      ...base,
      connection: connection({ live: false, retries: 3 })
    });
    expect(dropped[0].kind).toBe('connection');
    expect(dropped[0].text).toContain('dropped 3×');
  });

  it('carries the connection details', () => {
    const downSince = NOW.getTime() - 60e3;
    const nextAt = NOW.getTime() + 15e3;
    const [p] = problems({
      ...base,
      connection: connection({
        live: false,
        retries: 2,
        downSince,
        status: 'TIMED_OUT',
        nextAt
      })
    });
    expect(p).toMatchObject({
      kind: 'connection',
      since: downSince,
      retries: 2,
      status: 'TIMED_OUT',
      nextAt
    });
  });

  it('waits out the startup grace before saying Realtime is down', () => {
    const down = (over: Partial<Connection>): Connection =>
      connection({ live: false, ...over });
    const kinds = (c: Connection) =>
      problems({ ...base, connection: c }).map((p) => p.kind);
    expect(kinds(down({ downSince: NOW.getTime() - 5e3 }))).toEqual([]);
    expect(kinds(down({ downSince: NOW.getTime() - 10e3 }))).toEqual([
      'connection'
    ]);
    expect(kinds(down({ downSince: NOW.getTime() - 1e3, retries: 1 }))).toEqual(
      ['connection']
    );
    expect(kinds(down({ downSince: null }))).toEqual([]);
    const unstamped = problems({
      ...base,
      connection: down({ downSince: null, retries: 1 })
    });
    expect(unstamped[0]).toMatchObject({ since: NOW.getTime() });
  });

  it('clears the connection problem when the channel is live again', () => {
    expect(
      problems({ ...base, connection: connection({ retries: 3 }) })
    ).toEqual([]);
  });

  it('flags a queue_state view that does not parse', () => {
    const out = problems({ ...base, runs: runs(ago(5), [], true) });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('data');
    expect(out[0].text).toContain('does not parse');
  });

  it('carries the parse details and the kept view time', () => {
    const issues = [{ path: 'table', missing: true }];
    const bad: RunsPayload = {
      ...runs(ago(5), [], true),
      view: { limit: 1 },
      viewIssues: issues,
      qv: goodView(ago(30))
    };
    expect(problems({ ...base, runs: bad })).toEqual([
      expect.objectContaining({
        kind: 'data',
        reason: 'parse',
        since: Date.parse(ago(30)),
        goodAt: Date.parse(ago(30)),
        rowAt: Date.parse(ago(5)),
        view: { limit: 1 },
        issues
      })
    ]);
    const none = problems({ ...base, runs: runs(ago(5), [], true) });
    expect(none[0]).toMatchObject({
      goodAt: null,
      since: Date.parse(ago(5)),
      rowAt: Date.parse(ago(5))
    });
  });

  it('keys a problem by its kind, and a data problem by its reason', () => {
    const at = ago(60);
    const started = new Date(Date.parse(at) + 21 * MIN).toISOString();
    const stale = problems({
      ...base,
      runs: runs(at, [run(started, started)])
    });
    const parse = problems({ ...base, runs: runs(ago(5), [], true) });
    const down = problems({
      ...base,
      connection: connection({ live: false, retries: 1 })
    });
    expect([...down, ...parse, ...stale].map(problemKey)).toEqual([
      'connection',
      'data-parse',
      'data-stale'
    ]);
  });

  it('clears the parse problem when the row parses', () => {
    expect(problems({ ...base, runs: runs(ago(5)) })).toEqual([]);
  });

  it('flags a queue_state row older than the newest run by more than two intervals', () => {
    const at = ago(60);
    const startedAt = (min: number): string =>
      new Date(Date.parse(at) + min * MIN).toISOString();
    const late = problems({
      ...base,
      runs: runs(at, [run(startedAt(21), startedAt(22))])
    });
    expect(late).toHaveLength(1);
    expect(late[0].kind).toBe('data');
    expect(late[0].text).toContain('older than the newest run');
    expect(late[0]).toMatchObject({
      reason: 'stale',
      since: Date.parse(at),
      newestRun: Date.parse(startedAt(21))
    });
    expect(
      problems({
        ...base,
        runs: runs(at, [run(startedAt(20), startedAt(21))])
      })
    ).toEqual([]);
  });

  it('calls the state unknown when a session is alive and the NUC is silent', () => {
    const open: RunsPayload = {
      ...runs(ago(5)),
      qv: goodView(ago(5), { state: 'alive' })
    };
    const out = problems({
      ...base,
      runs: open,
      host: { ...host, ageMin: 31 }
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('unknown');
    expect(out[0]).toMatchObject({
      since: host.at,
      host: 'nuc',
      ticket: null,
      silentMin: 30,
      started: null
    });
    // A live host, no session or no host at all leaves it known
    expect(problems({ ...base, runs: open, host })).toEqual([]);
    expect(problems({ ...base, runs: open, host: null })).toEqual([]);
    expect(problems({ ...base, host: { ...host, ageMin: 31 } })).toEqual([]);
  });

  it("ignores a silent NUC when the alive session is another host's", () => {
    const open: RunsPayload = {
      ...runs(ago(5)),
      qv: goodView(ago(5), { state: 'alive', id: 's1' })
    };
    const silentHost = { ...host, ageMin: 31 };
    const args = { ...base, runs: open, host: silentHost };
    expect(
      problems({ ...args, sessions: [session({ id: 's1', host: 'mac' })] })
    ).toEqual([]);
    expect(
      problems({ ...args, sessions: [session({ id: 's1', host: 'nuc' })] })
    ).toHaveLength(1);
    // A session the rows do not know keeps the NUC's silence meaning
    expect(
      problems({ ...args, sessions: [session({ id: 's2', host: 'mac' })] })
    ).toHaveLength(1);
  });
});

describe('problems of an alive session', () => {
  it('names the ticket and when its open run started', () => {
    const host = {
      host: 'nuc',
      at: NOW.getTime() - 40 * MIN,
      ageMin: 40,
      silentMin: 30
    };
    const open: RunsPayload = {
      ...runs(ago(50), [
        { ...run(ago(45), null), ticket: 'COD-9' },
        { ...run(ago(90), ago(80)), ticket: 'COD-9' }
      ]),
      qv: goodView(ago(50), { state: 'alive', ticket: 'COD-9' })
    };
    const out = problems({
      connection: connection(),
      runs: open,
      runMinutes: 10,
      host,
      sessions: null,
      now: NOW
    });
    expect(out[0]).toMatchObject({
      kind: 'unknown',
      ticket: 'COD-9',
      started: Date.parse(ago(45))
    });
  });

  it('clears when the host has a fresh sample', () => {
    const open: RunsPayload = {
      ...runs(ago(5)),
      qv: goodView(ago(5), { state: 'alive' })
    };
    const host = { host: 'nuc', at: NOW.getTime(), ageMin: 0, silentMin: 30 };
    expect(
      problems({
        connection: connection(),
        runs: open,
        runMinutes: 10,
        host,
        sessions: null,
        now: NOW
      })
    ).toEqual([]);
  });
});

describe('frozenAt', () => {
  it('is the earliest since, null without problems', () => {
    const at = (since: number): Problem => ({
      kind: 'unknown',
      text: '',
      since,
      host: 'nuc',
      ticket: null,
      silentMin: 30,
      started: null
    });
    expect(frozenAt([at(300), at(100), at(200)])).toBe(100);
    expect(frozenAt([])).toBeNull();
  });

  it('ignores a connection problem: a down channel lags, it does not freeze', () => {
    const conn: Problem = {
      kind: 'connection',
      text: '',
      since: 50,
      retries: 1,
      status: null,
      nextAt: null
    };
    const data: Problem = {
      kind: 'data',
      reason: 'stale',
      text: '',
      since: 200,
      newestRun: 300
    };
    expect(frozenAt([conn])).toBeNull();
    expect(frozenAt([conn, data])).toBe(200);
  });
});

describe('health', () => {
  const fresh = (): Parameters<typeof health>[0] => ({
    connection: connection(),
    runs: runs(ago(5)),
    staleHours: 2,
    nuc: { host: 'nuc', at: NOW.getTime() - 2 * MIN, silentMin: 30 },
    sessions: [],
    events: [event()],
    storedAt: NOW.getTime() - 3 * MIN,
    now: NOW
  });

  const mac = (ageMin: number): HostSessions => ({
    host: 'mac',
    ageMin,
    sessions: [{ id: 's1', kind: 'attended', ageMin }]
  });

  it('lists the checks in the order the Platform view shows them', () => {
    const checks = health({ ...fresh(), sessions: [mac(2)] });
    expect(checks.map((c) => c.name)).toEqual([
      'Realtime',
      'queue_state parses',
      'Snapshot age',
      'nuc heartbeat',
      'mac heartbeat',
      'github_events last event',
      'Linear poll'
    ]);
  });

  it('is ok throughout when everything is fresh', () => {
    const checks = health({ ...fresh(), sessions: [mac(2)] });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.every((c) => c.at !== null)).toBe(true);
  });

  it('fails each check that is stale', () => {
    const checks = health({
      connection: connection({ live: false, upSince: null }),
      runs: runs(ago(180), [], true),
      staleHours: 2,
      nuc: { host: 'nuc', at: NOW.getTime() - 45 * MIN, silentMin: 30 },
      sessions: [mac(31)],
      events: [],
      storedAt: NOW.getTime() - 20 * MIN,
      now: NOW
    });
    expect(Object.fromEntries(checks.map((c) => [c.name, c.ok]))).toEqual({
      Realtime: false,
      'queue_state parses': false,
      'Snapshot age': false,
      'nuc heartbeat': false,
      'mac heartbeat': false,
      'github_events last event': false,
      'Linear poll': false
    });
    expect(checks.find((c) => c.name === 'github_events last event')?.at).toBe(
      null
    );
  });

  it('fails what has no data yet', () => {
    const checks = health({
      ...fresh(),
      runs: null,
      nuc: null,
      events: null,
      storedAt: null
    });
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ['Realtime', true],
      ['queue_state parses', false],
      ['Snapshot age', false],
      ['github_events last event', false],
      ['Linear poll', false]
    ]);
  });

  it('gives a session host other than the NUC its own heartbeat check', () => {
    const nucSession: HostSessions = {
      host: 'nuc',
      ageMin: 1,
      sessions: [{ id: 's2', kind: 'implement', ageMin: 1 }]
    };
    const checks = health({ ...fresh(), sessions: [nucSession, mac(10)] });
    const heartbeats = checks.filter((c) => c.name.endsWith('heartbeat'));
    // The NUC's sessions do not repeat the NUC's own check
    expect(heartbeats.map((c) => c.name)).toEqual([
      'nuc heartbeat',
      'mac heartbeat'
    ]);
    const macCheck = heartbeats[1];
    expect(macCheck.ok).toBe(true);
    expect(macCheck.at).toBe(NOW.getTime() - 10 * MIN);
  });
});
