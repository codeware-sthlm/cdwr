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
  agentPrs,
  handBack,
  health,
  hostSessions,
  prState,
  problems,
  pulse,
  sampleMinutes,
  silentAfter
} from './live';
import type { Connection } from './state';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const MIN = 6e4;

/** The ISO time `min` minutes before NOW */
const ago = (min: number): string =>
  new Date(NOW.getTime() - min * MIN).toISOString();

const connection = (over: Partial<Connection> = {}): Connection => ({
  live: true,
  retries: 0,
  upSince: NOW.getTime() - 60 * MIN,
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

describe('problems', () => {
  const host = { ageMin: 2, silentMin: 30 };
  const base = {
    connection: connection(),
    runs: runs(ago(5), [run(ago(10), ago(8))]),
    runMinutes: 10,
    host,
    now: NOW
  };

  it('finds nothing when all is well', () => {
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, runs: null, host: null })).toEqual([]);
  });

  it('says Realtime is down, with the drop count when there is one', () => {
    const none = problems({
      ...base,
      connection: connection({ live: false })
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

  it('flags a queue_state view that does not parse', () => {
    const out = problems({ ...base, runs: runs(ago(5), [], true) });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('data');
    expect(out[0].text).toContain('does not parse');
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
      qv: {
        at: ago(5),
        limit: { used: 0, max: 5 },
        session: { state: 'alive' },
        next: [],
        held: { tickets: [], free: [] },
        parked: [],
        table: { before: [], label: [], after: [] }
      }
    };
    const out = problems({
      ...base,
      runs: open,
      host: { ageMin: 31, silentMin: 30 }
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('unknown');
    // A live host, no session or no host at all leaves it known
    expect(problems({ ...base, runs: open, host })).toEqual([]);
    expect(problems({ ...base, runs: open, host: null })).toEqual([]);
    expect(problems({ ...base, host: { ageMin: 31, silentMin: 30 } })).toEqual(
      []
    );
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
