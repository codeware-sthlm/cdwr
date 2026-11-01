import { describe, expect, it } from 'vitest';

import type { Issue, StatusType } from '../linear';
import type {
  ActivityPayload,
  HostMetricRow,
  PlanUsageRow,
  RunsPayload,
  SessionRow,
  UsageHourRow
} from '../supabase';

import { HOST_METRICS_MINUTES } from './constants';
import {
  activityBy,
  agentState,
  byQueue,
  cpuDay,
  hostHealth,
  ideaVerdict,
  isProblem,
  macToday,
  mergeOrder,
  model,
  openIssues,
  planUsage,
  prOf,
  runsToday,
  shipped,
  ticketsByPr,
  usageBurn,
  versions,
  waitAges
} from './model';
import { type DeskState, type Detail, createState } from './state';
import type { QueueView } from './types';

// Local-time dates, so the specs read the same in every time zone
const NOW = new Date('2026-10-29T12:00:00');

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `Title of ${id}`,
  priority: { value: 3 },
  status: 'Todo',
  statusType: 'unstarted',
  labels: [],
  createdAt: '2026-10-01T08:00:00',
  updatedAt: '2026-10-01T08:00:00',
  url: `https://linear.app/codeware/issue/${id}`,
  completedAt: null,
  canceledAt: null,
  ...over
});

const detail = (over: Partial<Detail> = {}): Detail => ({
  steps: 0,
  done: 0,
  next: null,
  idea: null,
  blockedBy: [],
  pr: null,
  ...over
});

const view = (over: Partial<QueueView> = {}): QueueView => ({
  at: '2026-10-29T11:55:00',
  limit: { used: 2, max: 5 },
  session: { state: 'none' },
  next: [],
  held: { tickets: [], free: [] },
  parked: [],
  table: { before: [], label: [], after: [] },
  ...over
});

const runsPayload = (over: Partial<RunsPayload> = {}): RunsPayload => ({
  last: { when: '2026-10-29 11:50', outcome: 'planned COD-1' },
  attended: null,
  suggested: null,
  job: null,
  qv: view(),
  viewInvalid: false,
  view: null,
  viewIssues: [],
  at: '2026-10-29T11:55:00.000Z',
  main: { image: null, desk: null },
  rows: [],
  ...over
});

const withState = (build: (s: DeskState) => void): DeskState => {
  const s = createState();
  build(s);
  return s;
};

describe('byQueue', () => {
  const at = (statusType: StatusType, value: number, createdAt: string) => ({
    statusType,
    priority: { value },
    createdAt
  });

  it('orders by status, then priority, then age', () => {
    const list = [
      at('triage', 1, '2026-01-01'),
      at('backlog', 2, '2026-01-01'),
      at('unstarted', 3, '2026-02-01'),
      at('unstarted', 3, '2026-01-01'),
      at('unstarted', 1, '2026-03-01'),
      at('started', 4, '2026-03-01')
    ];
    const sorted = [...list].sort(byQueue);
    expect(
      sorted.map((i) => [i.statusType, i.priority.value, i.createdAt])
    ).toEqual([
      ['started', 4, '2026-03-01'],
      ['unstarted', 1, '2026-03-01'],
      ['unstarted', 3, '2026-01-01'],
      ['unstarted', 3, '2026-02-01'],
      ['backlog', 2, '2026-01-01'],
      ['triage', 1, '2026-01-01']
    ]);
  });

  it('ranks no priority below low priority', () => {
    const none = at('unstarted', 0, '2026-01-01');
    const low = at('unstarted', 4, '2026-01-01');
    expect([none, low].sort(byQueue)).toEqual([low, none]);
  });

  it('puts a status it does not know after the open ones', () => {
    const done = at('completed', 1, '2026-01-01');
    const triage = at('triage', 4, '2026-01-01');
    expect([done, triage].sort(byQueue)).toEqual([triage, done]);
  });
});

describe('mergeOrder', () => {
  const pr = (ticket: string) => ({ ticket });
  const blockedBy =
    (table: Record<string, string[]>) =>
    (ticket: string): string[] =>
      table[ticket] ?? [];

  it('keeps the queue view order when nothing blocks', () => {
    const prs = [pr('A'), pr('B'), pr('C')];
    expect(mergeOrder(prs, blockedBy({}))).toEqual(prs);
  });

  it('places a blocker before the PR it blocks', () => {
    const order = mergeOrder(
      [pr('A'), pr('B'), pr('C')],
      blockedBy({ A: ['C'] })
    );
    expect(order.map((x) => x.ticket)).toEqual(['C', 'A', 'B']);
  });

  it('follows a chain of blockers', () => {
    const order = mergeOrder(
      [pr('A'), pr('B'), pr('C')],
      blockedBy({ A: ['B'], B: ['C'] })
    );
    expect(order.map((x) => x.ticket)).toEqual(['C', 'B', 'A']);
  });

  it('ignores a blocker without an open PR', () => {
    const order = mergeOrder([pr('A'), pr('B')], blockedBy({ A: ['X'] }));
    expect(order.map((x) => x.ticket)).toEqual(['A', 'B']);
  });

  it('places every PR once when blockers form a cycle', () => {
    const order = mergeOrder(
      [pr('A'), pr('B'), pr('C')],
      blockedBy({ A: ['B'], B: ['A'] })
    );
    // The cycle is cut where it closes: B is placed first, then A
    expect(order.map((x) => x.ticket)).toEqual(['B', 'A', 'C']);
  });

  it('places a PR that blocks itself once', () => {
    const order = mergeOrder([pr('A')], blockedBy({ A: ['A'] }));
    expect(order.map((x) => x.ticket)).toEqual(['A']);
  });

  it('returns the same objects it was given', () => {
    const a = pr('A');
    expect(mergeOrder([a], blockedBy({}))[0]).toBe(a);
  });
});

describe('agentState and ideaVerdict', () => {
  it('reads the part after agent:', () => {
    expect(agentState({ labels: ['x', 'agent:review'] })).toBe('review');
    expect(agentState({ labels: ['agent-idea'] })).toBeNull();
    expect(agentState({ labels: [] })).toBeNull();
  });

  it.each([
    ['canceled', [], 'discarded'],
    ['canceled', ['agent:ready'], 'discarded'],
    ['unstarted', ['agent:ready'], 'accepted'],
    ['completed', [], 'accepted'],
    ['backlog', [], 'to decide']
  ] satisfies [StatusType, string[], string][])(
    'a %s idea with labels %j is %s',
    (statusType, labels, verdict) => {
      expect(ideaVerdict(issue('COD-9', { statusType, labels }))).toBe(verdict);
    }
  );
});

describe('isProblem', () => {
  it.each([
    ['idle', false],
    ['paused', false],
    ['planned', false],
    ['planned COD-12', false],
    ['launched', false],
    ['implemented', false],
    ['suggested COD-3', false],
    ['nothing', false],
    ['skip', false],
    ['failed', true],
    ['cap', true],
    ['planned nothing', true],
    ['idle again', true]
  ])('%s -> %s', (outcome, problem) => {
    expect(isProblem(outcome)).toBe(problem);
  });
});

describe('openIssues', () => {
  it('merges the buckets, drops closed and other repos, and sorts', () => {
    const state = withState((s) => {
      s.data.buckets.set('started', [
        issue('COD-1', { statusType: 'started' }),
        issue('COD-2', { statusType: 'completed' })
      ]);
      s.data.buckets.set('backlog', [
        issue('COD-3', { statusType: 'backlog' }),
        issue('COD-4', { statusType: 'backlog', labels: ['nx-plugins'] }),
        issue('COD-5', { statusType: 'canceled' })
      ]);
      s.data.buckets.set('unstarted', [issue('COD-6')]);
    });
    expect(openIssues(state.data).map((i) => i.id)).toEqual([
      'COD-1',
      'COD-6',
      'COD-3'
    ]);
  });

  it('is empty before anything loaded', () => {
    expect(openIssues(createState().data)).toEqual([]);
  });
});

describe('prOf', () => {
  const details = new Map([['A', detail({ pr: 7 })]]);

  it('prefers the PR the queue view knows', () => {
    expect(prOf(details, 'A', 9)).toBe(9);
  });
  it('falls back to the attached PR, then null', () => {
    expect(prOf(details, 'A')).toBe(7);
    expect(prOf(details, 'A', null)).toBe(7);
    expect(prOf(details, 'B')).toBeNull();
  });
});

describe('model', () => {
  it('is empty and loading-safe before anything arrived', () => {
    const m = model(createState(), NOW);
    expect(m.v).toBeNull();
    expect(m.runs).toBeNull();
    expect(m.all).toEqual([]);
    expect(m.next).toEqual([]);
    expect(m.limit).toEqual({ used: 0, max: 5 });
    expect(m.held).toEqual({ tickets: [], free: [] });
    expect(m.session).toBeNull();
    expect(m.stuck).toBeNull();
    expect(m.lastRunAge).toBeNull();
    expect(m.schedulerStale).toBe(true);
    expect(m.installStale).toBe(false);
    expect(m.nextRun).toBeNull();
    expect(m.runMinutes).toBe(10);
    expect(m.activityAge).toBeNull();
    expect(m.activityDay).toBe(0);
    expect(m.suggested).toBeNull();
  });

  it('answers a ticket the lists lack with a stub', () => {
    const m = model(createState(), NOW);
    expect(m.get('COD-77')).toEqual({
      id: 'COD-77',
      title: '',
      url: 'https://linear.app/codeware/issue/COD-77',
      status: '',
      completedAt: null,
      priority: null
    });
  });

  it('finds titles among open and recently closed tickets', () => {
    const state = withState((s) => {
      s.data.buckets.set('started', [issue('COD-1', { title: 'Open one' })]);
      s.data.closed = [issue('COD-2', { title: 'Closed one' })];
    });
    const m = model(state, NOW);
    expect(m.get('COD-1').title).toBe('Open one');
    expect(m.get('COD-2').title).toBe('Closed one');
  });

  describe('with a queue view', () => {
    const state = withState((s) => {
      s.data.buckets.set('started', [
        issue('COD-10', { statusType: 'started', labels: ['agent:review'] }),
        issue('COD-11', { statusType: 'started', labels: ['agent:review'] }),
        issue('COD-12', { statusType: 'started', labels: ['agent:working'] })
      ]);
      s.data.closed = [issue('COD-13', { statusType: 'completed' })];
      s.data.runs = runsPayload({
        qv: view({
          session: {
            state: 'alive',
            detail: 'polling',
            lastSeen: '2026-10-29T11:40:00'
          },
          next: [
            { ticket: 'COD-20', reason: 'ready' },
            { ticket: 'COD-21', reason: 'answered' }
          ],
          held: {
            tickets: ['COD-22'],
            free: [{ action: 'review', ticket: 'COD-10' }]
          },
          parked: [
            { ticket: 'COD-12', wait: 'ci', pr: 120 },
            { ticket: 'COD-10', wait: 'copilot' },
            { ticket: 'COD-14', wait: 'later' }
          ],
          table: {
            before: [
              { ticket: 'COD-30', kind: 'plan' },
              { ticket: 'COD-31', kind: 'question' },
              { ticket: 'COD-32' }
            ],
            label: [
              { ticket: 'COD-33', parent: 'COD-29', blockers: ['COD-10'] }
            ],
            after: [
              { ticket: 'COD-10', kind: 'pr', pr: 100 },
              { ticket: 'COD-11', kind: 'pr', pr: 101 },
              { ticket: 'COD-40', kind: 'handoffs', items: ['Check A'] },
              {
                ticket: 'COD-41',
                kind: 'handoffs',
                items: ['Check B', 'Check C']
              },
              { ticket: 'COD-42', kind: 'handoffs', items: [] }
            ]
          }
        })
      });
      // COD-10 waits for COD-11 (open) and COD-13 (closed, so no longer blocks)
      s.details.set(
        'COD-10',
        detail({ blockedBy: ['COD-11', 'COD-13'], pr: 100 })
      );
      // COD-41's ticks were read live: one item is left
      s.liveHandoffs.set('COD-41', ['Check C']);
      // COD-40's were all ticked since the view was taken
      s.liveHandoffs.set('COD-40', []);
    });
    const m = model(state, NOW);

    it('splits the Before column into plans and questions', () => {
      expect(m.plans.map((x) => x.ticket)).toEqual(['COD-30']);
      expect(m.questions.map((x) => x.ticket)).toEqual(['COD-31', 'COD-32']);
    });

    it('carries the sub-issues to label, apart from the limit', () => {
      expect(m.toLabel).toEqual([
        { ticket: 'COD-33', parent: 'COD-29', blockers: ['COD-10'] }
      ]);
      expect(m.before.map((x) => x.ticket)).not.toContain('COD-33');
      expect(m.limit).toEqual({ used: 2, max: 5 });
    });

    it('orders the open PRs after their open blockers', () => {
      expect(m.prs.map((x) => x.ticket)).toEqual(['COD-11', 'COD-10']);
      expect(m.prBlockers.get('COD-10')).toEqual([
        { ticket: 'COD-11', pr: 101 }
      ]);
      expect(m.prBlockers.get('COD-11')).toEqual([]);
    });

    it('reads hand-off items live, ahead of the queue view', () => {
      expect(m.handoffs.map((x) => [x.ticket, x.items])).toEqual([
        ['COD-41', ['Check C']]
      ]);
      expect(m.handoffItems).toBe(1);
    });

    it('lists the slots held by open PRs, then parked tickets without one', () => {
      expect(m.slots).toEqual([
        { ticket: 'COD-11', pr: 101, why: 'open PR, in review' },
        { ticket: 'COD-10', pr: 100, why: 'open PR, in review' },
        { ticket: 'COD-12', pr: 120, why: 'PR waits on CI' },
        { ticket: 'COD-14', pr: undefined, why: 'PR waits on later' }
      ]);
    });

    it('keeps a parked review out of parked, as its open PR’s wait', () => {
      expect(m.parked.map((p) => p.ticket)).toEqual(['COD-12', 'COD-14']);
      expect([...m.prWaits.keys()]).toEqual(['COD-10']);
      expect(m.prWaits.get('COD-10')?.wait).toBe('copilot');
    });

    it('passes the queue view through', () => {
      expect(m.next.map((x) => x.ticket)).toEqual(['COD-20', 'COD-21']);
      expect(m.limit).toEqual({ used: 2, max: 5 });
      expect(m.held.tickets).toEqual(['COD-22']);
      expect(m.session?.state).toBe('alive');
    });

    it('calls a session stuck once it polled five minutes with work queued', () => {
      // lastSeen 11:40, view taken 11:55
      expect(m.stuck).toBe(15);
    });

    it('is not stuck without queued work or with a fresh heartbeat', () => {
      const idle = withState((s) => {
        s.data.runs = runsPayload({
          qv: view({
            session: {
              state: 'alive',
              detail: 'polling',
              lastSeen: '2026-10-29T11:40:00'
            }
          })
        });
      });
      expect(model(idle, NOW).stuck).toBeNull();

      const fresh = withState((s) => {
        s.data.runs = runsPayload({
          qv: view({
            session: {
              state: 'alive',
              detail: 'polling',
              lastSeen: '2026-10-29T11:53:00'
            },
            next: [{ ticket: 'COD-20', reason: 'ready' }]
          })
        });
      });
      expect(model(fresh, NOW).stuck).toBeNull();
    });
  });

  describe('against live Linear', () => {
    // The view was taken at 11:55; COD-1 changed at 11:57, COD-2 at 11:50
    const live = (next: string | null) =>
      withState((s) => {
        s.data.buckets.set('started', [
          issue('COD-1', {
            statusType: 'started',
            labels: ['agent:review'],
            updatedAt: '2026-10-29T11:57:00'
          }),
          issue('COD-2', {
            statusType: 'started',
            labels: ['agent:working'],
            updatedAt: '2026-10-29T11:50:00'
          })
        ]);
        s.data.runs = runsPayload({
          qv: view({
            next: [{ ticket: 'COD-1', reason: 'parked wait resolved' }],
            parked: [
              { ticket: 'COD-1', wait: 'ci', pr: 713, resolved: true },
              { ticket: 'COD-2', wait: 'copilot', pr: 714 }
            ]
          })
        });
        s.details.set('COD-1', detail({ next }));
        s.details.set('COD-2', detail({ next: 'step 2' }));
      });

    it('drops a parked entry whose live Next line moved on', () => {
      const m = model(live("waiting for Håkan's review of PR 713"), NOW);
      expect(m.next).toEqual([]);
      expect(m.parked.map((p) => p.ticket)).toEqual(['COD-2']);
      expect(m.slots.map((x) => x.ticket)).toEqual(['COD-2']);
    });

    it('keeps it while the live Next line still waits', () => {
      const m = model(live('`Waiting: CI · PR 713 @ 1a2b3c4 · since x`'), NOW);
      expect(m.next.map((x) => x.ticket)).toEqual(['COD-1']);
      expect(m.parked.map((p) => p.ticket)).toEqual(['COD-1', 'COD-2']);
    });

    it('drops an open PR whose ticket merged since the view', () => {
      const merged = withState((s) => {
        s.data.closed = [
          issue('COD-3', {
            statusType: 'completed',
            labels: ['agent:review'],
            updatedAt: '2026-10-29T11:58:00'
          })
        ];
        s.data.runs = runsPayload({
          qv: view({
            table: {
              before: [],
              label: [],
              after: [{ ticket: 'COD-3', kind: 'pr', pr: 9 }]
            }
          })
        });
      });
      const m = model(merged, NOW);
      expect(m.prs).toEqual([]);
      expect(m.slots).toEqual([]);
    });
  });

  describe('behind main', () => {
    const OLD = 'abc1234' + '0'.repeat(33);
    const NEW = 'def5678' + '0'.repeat(33);
    const job = (over: Partial<NonNullable<RunsPayload['job']>> = {}) => ({
      line: 'every 10 min',
      minutes: 10,
      live: false,
      host: 'container' as const,
      rev: 'sha-abc1234',
      install: 'current' as const,
      items: '',
      effort: null,
      paused: false,
      ...over
    });
    const at = (over: Partial<RunsPayload>, desk: string | null = null) =>
      model(
        withState((s) => {
          s.data.runs = runsPayload(over);
        }),
        NOW,
        desk
      );

    it('flags an image that differs from main', () => {
      const m = at({ job: job(), main: { image: NEW, desk: null } });
      expect(m.imageBehind).toEqual({
        runs: 'sha-abc1234',
        main: 'sha-def5678'
      });
    });

    it('is current when the image is main', () => {
      const m = at({ job: job(), main: { image: OLD, desk: null } });
      expect(m.imageBehind).toBeNull();
    });

    it('does not know without the Job line commit', () => {
      const m = at({
        job: job({ rev: null }),
        main: { image: NEW, desk: null }
      });
      expect(m.imageBehind).toBeNull();
    });

    it('does not know without main image', () => {
      expect(at({ job: job() }).imageBehind).toBeNull();
    });

    it('ignores a launchd host', () => {
      const m = at({
        job: job({ host: 'launchd' }),
        main: { image: NEW, desk: null }
      });
      expect(m.imageBehind).toBeNull();
    });

    it('flags a desk that differs from main', () => {
      const m = at({ main: { image: null, desk: NEW } }, OLD);
      expect(m.deskBehind).toEqual({
        runs: 'sha-abc1234',
        main: 'sha-def5678'
      });
    });

    it('is current when the desk is main', () => {
      expect(
        at({ main: { image: null, desk: OLD } }, OLD).deskBehind
      ).toBeNull();
    });

    it('does not know a local build', () => {
      expect(
        at({ main: { image: null, desk: NEW } }, null).deskBehind
      ).toBeNull();
    });
  });

  describe('scheduler health', () => {
    const at = (over: Partial<RunsPayload>) =>
      model(
        withState((s) => {
          s.data.runs = runsPayload(over);
        }),
        NOW
      );

    it('is fresh ten minutes after the last run', () => {
      const m = at({});
      expect(m.lastRunAge).toBeCloseTo(10 / 60);
      expect(m.staleHours).toBe(2);
      expect(m.schedulerStale).toBe(false);
      expect(m.runProblems).toEqual([]);
    });

    it('is silent after more than the stale hours', () => {
      const m = at({ last: { when: '2026-10-29 09:00', outcome: 'idle' } });
      expect(m.lastRunAge).toBeCloseTo(3);
      expect(m.schedulerStale).toBe(true);
    });

    it('stretches the stale hours for a slow interval', () => {
      const m = at({
        last: { when: '2026-10-29 09:00', outcome: 'idle' },
        job: {
          line: 'Job: every 120 min',
          minutes: 120,
          live: false,
          host: 'launchd',
          rev: null,
          install: 'current',
          items: '',
          effort: null,
          paused: false
        }
      });
      expect(m.staleHours).toBe(5);
      expect(m.schedulerStale).toBe(false);
    });

    it('flags a stale install', () => {
      const m = at({
        job: {
          line: 'Job: every 10 min',
          minutes: 10,
          live: false,
          host: 'launchd',
          rev: null,
          install: 'stale',
          items: 'run.sh',
          effort: null,
          paused: false
        }
      });
      expect(m.installStale).toBe(true);
    });

    const row = (when: string, outcome: string) => ({
      when,
      outcome,
      ticket: '',
      detail: '',
      started: new Date(when.replace(' ', 'T')).toISOString(),
      finished: null
    });

    it('counts the problems of the last 24 hours when no run went well since', () => {
      const m = at({
        last: { when: '2026-10-29 11:50', outcome: 'failed' },
        rows: [
          row('2026-10-29 10:00', 'failed'),
          row('2026-10-29 09:00', 'cap'),
          row('2026-10-28 08:00', 'failed')
        ]
      });
      expect(m.runProblems.map((r) => r.when)).toEqual([
        '2026-10-29 10:00',
        '2026-10-29 09:00'
      ]);
    });

    it('lets an OK last-run line clear the earlier problems', () => {
      const m = at({
        last: { when: '2026-10-29 11:50', outcome: 'idle' },
        rows: [row('2026-10-29 10:00', 'failed')]
      });
      expect(m.runProblems).toEqual([]);
    });

    it('keeps a problem that no later run followed', () => {
      const m = at({
        last: { when: '2026-10-29 08:00', outcome: 'failed' },
        rows: [
          row('2026-10-29 10:00', 'failed'),
          row('2026-10-29 09:00', 'planned COD-1'),
          row('2026-10-28 08:00', 'failed')
        ]
      });
      expect(m.runProblems.map((r) => r.when)).toEqual(['2026-10-29 10:00']);
    });

    it('lets an OK row clear the earlier problems', () => {
      const m = at({
        last: { when: '2026-10-29 08:00', outcome: 'failed' },
        rows: [
          row('2026-10-29 10:00', 'implemented'),
          row('2026-10-29 09:00', 'failed')
        ]
      });
      expect(m.runProblems).toEqual([]);
    });
  });

  describe('next run', () => {
    const next = (when: string, minutes: number | null) =>
      model(
        withState((s) => {
          s.data.runs = runsPayload({
            last: { when, outcome: 'idle' },
            job: minutes
              ? {
                  line: '',
                  minutes,
                  live: false,
                  host: null,
                  rev: null,
                  install: 'current',
                  items: '',
                  effort: null,
                  paused: false
                }
              : null
          });
        }),
        NOW
      );

    it('is the last run plus one interval while that is ahead', () => {
      expect(next('2026-10-29 11:55', 10).nextRun).toBe(
        new Date('2026-10-29T12:05:00').getTime()
      );
    });

    it('steps by whole intervals past now', () => {
      expect(next('2026-10-29 11:03', 10).nextRun).toBe(
        new Date('2026-10-29T12:03:00').getTime()
      );
    });

    it('is live with the fallback interval when the listener is up', () => {
      const m = model(
        withState((s) => {
          s.data.runs = runsPayload({
            last: { when: '2026-10-29 11:30', outcome: 'idle' },
            job: {
              line: 'live · fallback 60 min',
              minutes: 60,
              live: true,
              host: 'container',
              rev: null,
              install: 'current',
              items: '',
              effort: null,
              paused: false
            }
          });
        }),
        NOW
      );
      expect(m.live).toBe(true);
      expect(m.runMinutes).toBe(60);
      expect(m.nextRun).toBe(new Date('2026-10-29T12:30:00').getTime());
    });

    it('assumes ten minutes without a Job line', () => {
      const m = next('2026-10-29 11:55', null);
      expect(m.runMinutes).toBe(10);
      expect(m.nextRun).toBe(new Date('2026-10-29T12:05:00').getTime());
    });
  });

  describe('ideas', () => {
    const state = withState((s) => {
      s.data.ideas = [
        issue('COD-50', { createdAt: '2026-10-20T08:00:00' }),
        issue('COD-51', { createdAt: '2026-10-10T08:00:00' }),
        issue('COD-52', {
          statusType: 'started',
          labels: ['agent:working'],
          createdAt: '2026-10-05T08:00:00'
        }),
        issue('COD-53', {
          statusType: 'completed',
          createdAt: '2026-10-06T08:00:00'
        }),
        issue('COD-54', {
          statusType: 'canceled',
          canceledAt: '2026-10-12T08:00:00',
          createdAt: '2026-10-01T08:00:00'
        }),
        issue('COD-55', {
          statusType: 'canceled',
          canceledAt: '2026-10-25T08:00:00',
          createdAt: '2026-10-02T08:00:00'
        }),
        issue('COD-56', { labels: ['enjinex'] })
      ];
    });
    const m = model(state, NOW);

    it('sorts the ideas to decide oldest first', () => {
      expect(m.ideasPending.map((i) => i.id)).toEqual(['COD-51', 'COD-50']);
    });
    it('sorts the accepted newest first', () => {
      expect(m.ideasAccepted.map((i) => i.id)).toEqual(['COD-53', 'COD-52']);
    });
    it('sorts the discarded by when they were cancelled, newest first', () => {
      expect(m.ideasDiscarded.map((i) => i.id)).toEqual(['COD-55', 'COD-54']);
    });
  });

  describe('activity', () => {
    it('measures the age of the activity and counts the last 24 hours', () => {
      const state = withState((s) => {
        s.data.activity = {
          updated: '2026-10-29 11:00',
          header: '2026-10-29 11:00',
          dropped: '',
          rows: [
            {
              when: '2026-10-29 10:00',
              ticket: 'COD-1',
              actor: 'agent',
              change: 'x'
            },
            {
              when: '2026-10-28 13:00',
              ticket: 'COD-1',
              actor: 'agent',
              change: 'x'
            },
            {
              when: '2026-10-28 11:00',
              ticket: 'COD-1',
              actor: 'agent',
              change: 'x'
            }
          ]
        };
      });
      const m = model(state, NOW);
      expect(m.activityAge).toBe(60);
      expect(m.activityDay).toBe(2);
    });
  });

  it('does not read the clock: the same state and time give the same model', () => {
    const state = withState((s) => {
      s.data.runs = runsPayload();
    });
    const a = model(state, NOW);
    const b = model(state, NOW);
    expect(a.nextRun).toBe(b.nextRun);
    expect(a.lastRunAge).toBe(b.lastRunAge);
  });
});

describe('runsToday', () => {
  // Local-time clock, whatever the zone the specs run in
  const at = (d: number, h: number, min = 0): Date =>
    new Date(2026, 9, d, h, min);
  const now = at(29, 12);
  const run = (
    started: Date,
    finished: Date | null,
    outcome = 'implemented'
  ): RunsPayload['rows'][number] => ({
    when: '',
    outcome,
    ticket: '',
    detail: '',
    started: started.toISOString(),
    finished: finished ? finished.toISOString() : null
  });

  it('is empty without runs', () => {
    expect(runsToday([], now)).toEqual({
      count: 0,
      medianMs: null,
      failed: 0
    });
  });

  it('counts only the runs since local midnight', () => {
    const r = runsToday(
      [
        run(at(29, 0, 0), at(29, 0, 5)),
        run(at(29, 9), at(29, 9, 10)),
        run(at(28, 23, 59), at(29, 0, 4))
      ],
      now
    );
    expect(r.count).toBe(2);
    // 5 and 10 minutes
    expect(r.medianMs).toBe(7.5 * 6e4);
  });

  it('takes the middle duration of an odd count', () => {
    const r = runsToday(
      [
        run(at(29, 8), at(29, 8, 1)),
        run(at(29, 9), at(29, 9, 30)),
        run(at(29, 10), at(29, 10, 10))
      ],
      now
    );
    expect(r.medianMs).toBe(10 * 6e4);
  });

  it('averages the two middle durations of an even count', () => {
    const r = runsToday(
      [
        run(at(29, 8), at(29, 8, 2)),
        run(at(29, 9), at(29, 9, 4)),
        run(at(29, 10), at(29, 10, 20)),
        run(at(29, 11), at(29, 11, 40))
      ],
      now
    );
    expect(r.medianMs).toBe(12 * 6e4);
  });

  it('leaves open runs out of the median but not the count', () => {
    const r = runsToday(
      [run(at(29, 8), at(29, 8, 6)), run(at(29, 11, 50), null)],
      now
    );
    expect(r.count).toBe(2);
    expect(r.medianMs).toBe(6 * 6e4);
    expect(runsToday([run(at(29, 11, 50), null)], now).medianMs).toBeNull();
  });

  it('counts the runs whose outcome is a problem as failed', () => {
    const r = runsToday(
      [
        run(at(29, 8), at(29, 8, 1), 'failed'),
        run(at(29, 9), at(29, 9, 1), 'cap'),
        run(at(29, 10), at(29, 10, 1), 'planned COD-1'),
        run(at(28, 10), at(28, 10, 1), 'failed')
      ],
      now
    );
    expect(r.count).toBe(3);
    expect(r.failed).toBe(2);
  });
});

describe('activityBy', () => {
  const rows = (...actors: [string, string][]): ActivityPayload => ({
    updated: '2026-10-29 11:50',
    header: '',
    dropped: '',
    rows: actors.map(([when, actor]) => ({
      when,
      ticket: 'COD-1',
      actor,
      change: 'x'
    }))
  });

  it('is zero without activity', () => {
    expect(activityBy(null, NOW)).toEqual({ agent: 0, human: 0 });
  });

  it('counts the agent and the scheduler against everyone else', () => {
    const a = rows(
      ['2026-10-29 11:00', 'agent'],
      ['2026-10-29 10:00', 'scheduler'],
      ['2026-10-29 09:00', 'Håkan'],
      ['2026-10-29 08:00', 'Copilot']
    );
    expect(activityBy(a, NOW)).toEqual({ agent: 2, human: 2 });
  });

  it('leaves out what is more than 24 hours old', () => {
    const a = rows(
      ['2026-10-28 12:00', 'agent'],
      ['2026-10-28 11:59', 'agent'],
      ['2026-10-28 11:59', 'Håkan']
    );
    expect(activityBy(a, NOW)).toEqual({ agent: 1, human: 0 });
  });
});

describe('waitAges', () => {
  const activity = (...rows: [string, string, string][]): ActivityPayload => ({
    updated: '2026-10-29 11:50',
    header: '',
    dropped: '',
    rows: rows.map(([when, ticket, change]) => ({
      when,
      ticket,
      actor: 'agent',
      change
    }))
  });

  it('prefers the newest gate event over a newer ordinary one', () => {
    // Newest first, as the activity rows are
    const a = activity(
      ['2026-10-29 11:30', 'COD-1', 'Moved to In Progress'],
      ['2026-10-29 10:00', 'COD-1', '+agent:needs-input'],
      ['2026-10-29 09:00', 'COD-1', '+agent:needs-input']
    );
    expect(waitAges(['COD-1'], a, NOW).get('COD-1')).toBe(120);
  });

  it('reads a gate comment as a gate event', () => {
    const a = activity(
      ['2026-10-29 11:30', 'COD-2', 'Moved to In Progress'],
      ['2026-10-29 08:00', 'COD-2', 'comment: **Agent: plan ready**']
    );
    expect(waitAges(['COD-2'], a, NOW).get('COD-2')).toBe(240);
  });

  it('falls back to the newest row without a gate event', () => {
    const a = activity(
      ['2026-10-29 11:30', 'COD-3', 'Moved to In Progress'],
      ['2026-10-29 09:00', 'COD-3', 'Moved to Todo']
    );
    expect(waitAges(['COD-3'], a, NOW).get('COD-3')).toBe(30);
  });

  it('leaves out tickets without rows or without activity', () => {
    const a = activity(['2026-10-29 11:30', 'COD-1', '+agent:review']);
    const ages = waitAges(['COD-1', 'COD-9'], a, NOW);
    expect([...ages.keys()]).toEqual(['COD-1']);
    expect(waitAges(['COD-1'], null, NOW).size).toBe(0);
  });
});

describe('ticketsByPr', () => {
  it('prefers the queue view’s PR over the attached one', () => {
    const details = new Map([['A', detail({ pr: 7 })]]);
    expect(ticketsByPr(details, [{ ticket: 'A', pr: 9 }])).toEqual(
      new Map([[9, 'A']])
    );
    expect(ticketsByPr(details, [{ ticket: 'A' }])).toEqual(
      new Map([[7, 'A']])
    );
  });

  it('reads a PR written as a string as a number', () => {
    const map = ticketsByPr(new Map(), [{ ticket: 'A', pr: '12' }]);
    expect(map.get(12)).toBe('A');
  });

  it('leaves out tickets without a usable PR', () => {
    const map = ticketsByPr(new Map(), [
      { ticket: 'A' },
      { ticket: 'B', pr: null },
      { ticket: 'C', pr: 'soon' },
      { ticket: 'D', pr: 0 }
    ]);
    expect(map.size).toBe(0);
  });

  it('keeps the first ticket when two name the same PR', () => {
    const map = ticketsByPr(new Map(), [
      { ticket: 'A', pr: 5 },
      { ticket: 'B', pr: '5' }
    ]);
    expect([...map]).toEqual([[5, 'A']]);
  });
});

describe('shipped', () => {
  const closedOn = (
    id: string,
    completedAt: string,
    labels = ['agent:review']
  ) => issue(id, { statusType: 'completed', completedAt, labels });

  it('lists 30 local days ending today', () => {
    const { days } = shipped([], NOW);
    expect(days).toHaveLength(30);
    expect(days[0].key).toBe('2026-09-30');
    expect(days[29].key).toBe('2026-10-29');
  });

  it('is empty without closed tickets', () => {
    expect(shipped(null, NOW)).toMatchObject({ total: 0, week: 0 });
    expect(shipped([], NOW)).toMatchObject({ total: 0, week: 0 });
  });

  it('files each agent ticket under the day it closed', () => {
    const a = closedOn('COD-1', '2026-10-29T09:00:00');
    const b = closedOn('COD-2', '2026-10-29T10:00:00');
    const c = closedOn('COD-3', '2026-10-20T10:00:00');
    const s = shipped([a, b, c], NOW);
    expect(s.days[29].items).toEqual([a, b]);
    expect(s.days.find((d) => d.key === '2026-10-20')?.items).toEqual([c]);
    expect(s.total).toBe(3);
  });

  it('counts the last seven days as the week', () => {
    const s = shipped(
      [
        closedOn('COD-1', '2026-10-29T09:00:00'),
        closedOn('COD-2', '2026-10-23T09:00:00'),
        closedOn('COD-3', '2026-10-22T09:00:00')
      ],
      NOW
    );
    expect(s.week).toBe(2);
    expect(s.total).toBe(3);
  });

  it('leaves out tickets without an agent label, of other repos, without a close time or outside the window', () => {
    const s = shipped(
      [
        closedOn('COD-1', '2026-10-28T09:00:00', ['bug']),
        closedOn('COD-2', '2026-10-28T09:00:00', [
          'agent:review',
          'nx-plugins'
        ]),
        issue('COD-3', { statusType: 'completed', labels: ['agent:review'] }),
        closedOn('COD-4', '2026-08-01T09:00:00'),
        closedOn('COD-5', '2026-10-28T09:00:00')
      ],
      NOW
    );
    expect(s.total).toBe(1);
    expect(s.days[28].items.map((i) => i.id)).toEqual(['COD-5']);
  });
});

describe('hostHealth', () => {
  const GIB = 2 ** 30;
  // A calm sample `ago` minutes before NOW
  const sample = (
    ago: number,
    over: Partial<HostMetricRow> = {}
  ): HostMetricRow => ({
    id: 1,
    host: 'nuc',
    at: new Date(NOW.getTime() - ago * 6e4).toISOString(),
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
    cgroup_mem_max: null,
    ...over
  });

  it('is null without samples', () => {
    expect(hostHealth(null, NOW)).toBeNull();
    expect(hostHealth([], NOW)).toBeNull();
  });

  it('is ok for a calm host and reads the latest figures', () => {
    const h = hostHealth([sample(20), sample(10), sample(0)], NOW);
    expect(h?.verdict).toBe('ok');
    expect(h?.problems).toEqual([]);
    expect(h?.figures.load).toBeCloseTo(0.25);
    expect(h?.figures.mem).toBeCloseTo(0.25);
    expect(h?.figures.disk).toBeCloseTo(0.4);
    expect(h?.figures.container).toBeNull();
  });

  it('is bad when the 30-minute average load per core passes 1', () => {
    const busy = { load5: 6 };
    expect(
      hostHealth([sample(20, busy), sample(10, busy), sample(0, busy)], NOW)
    ).toMatchObject({ verdict: 'bad', problems: ['load'] });
    // One spike among calm samples averages below the limit
    expect(
      hostHealth([sample(20), sample(10), sample(0, { load5: 8 })], NOW)
        ?.verdict
    ).toBe('ok');
  });

  it('leaves samples older than the window out of the average', () => {
    const h = hostHealth(
      [sample(120, { load5: 40 }), sample(10), sample(0)],
      NOW
    );
    expect(h?.verdict).toBe('ok');
    expect(h?.average.load).toBeCloseTo(0.25);
  });

  it('is bad when memory used passes 90 %, not at 90 %', () => {
    expect(
      hostHealth([sample(0, { mem_available: 0.7 * GIB })], NOW)?.problems
    ).toEqual(['memory']);
    expect(
      hostHealth([sample(0, { mem_available: 0.8 * GIB })], NOW)?.verdict
    ).toBe('ok');
  });

  it('is bad when swap is in use and growing, not when it is steady or unused', () => {
    const used = (gib: number): Partial<HostMetricRow> => ({
      swap_free: (2 - gib) * GIB
    });
    const growing = hostHealth(
      [sample(20, used(0.2)), sample(0, used(0.5))],
      NOW
    );
    expect(growing?.swapGrowing).toBe(true);
    expect(growing?.problems).toEqual(['swap']);
    const steady = hostHealth(
      [sample(20, used(0.5)), sample(0, used(0.5))],
      NOW
    );
    expect(steady?.swapGrowing).toBe(false);
    expect(steady?.verdict).toBe('ok');
    const shrinking = hostHealth(
      [sample(20, used(0.5)), sample(0, used(0.2))],
      NOW
    );
    expect(shrinking?.swapGrowing).toBe(false);
    expect(hostHealth([sample(20), sample(0)], NOW)?.swapGrowing).toBe(false);
  });

  it('treats exactly 10 % disk free as ok and just under as bad', () => {
    expect(
      hostHealth([sample(0, { disk_free: 10 * GIB })], NOW)?.problems
    ).toEqual([]);
    expect(
      hostHealth([sample(0, { disk_free: 10 * GIB - 1 })], NOW)?.problems
    ).toEqual(['disk']);
  });

  it('reports a sample 30 h old as stale, not missing', () => {
    const h = hostHealth([sample(30 * 60)], NOW);
    expect(h?.verdict).toBe('stale');
    expect(h?.series).toHaveLength(1);
  });

  it('is bad when disk free drops below 10 %', () => {
    expect(
      hostHealth([sample(0, { disk_free: 9 * GIB })], NOW)?.problems
    ).toEqual(['disk']);
    expect(hostHealth([sample(0, { disk_free: 11 * GIB })], NOW)?.verdict).toBe(
      'ok'
    );
  });

  it('lists every problem', () => {
    const h = hostHealth(
      [sample(0, { load5: 9, mem_available: 0, disk_free: 0 })],
      NOW
    );
    expect(h?.problems).toEqual(['load', 'memory', 'disk']);
  });

  it('is stale after three sample intervals, whatever the newest sample says', () => {
    // Samples 10 minutes apart: silent after 30 minutes
    const slow = hostHealth(
      [sample(51), sample(41), sample(31, { load5: 9 })],
      NOW
    );
    expect(slow?.intervalMin).toBeCloseTo(10);
    expect(slow?.silentMin).toBeCloseTo(30);
    expect(slow?.ageMin).toBeCloseTo(31);
    expect(slow?.verdict).toBe('stale');
    const slowOk = hostHealth([sample(49), sample(39), sample(29)], NOW);
    expect(slowOk?.silentMin).toBeCloseTo(30);
    expect(slowOk?.verdict).toBe('ok');

    // Samples a minute apart: silent after 3 minutes
    const fast = hostHealth([sample(6), sample(5), sample(4)], NOW);
    expect(fast?.intervalMin).toBeCloseTo(1);
    expect(fast?.silentMin).toBeCloseTo(3);
    expect(fast?.verdict).toBe('stale');
    const fastOk = hostHealth([sample(4), sample(3), sample(2)], NOW);
    expect(fastOk?.silentMin).toBeCloseTo(3);
    expect(fastOk?.verdict).toBe('ok');
  });

  it('assumes the sampler interval from a single sample', () => {
    const stale = hostHealth([sample(4)], NOW);
    expect(stale?.intervalMin).toBe(HOST_METRICS_MINUTES);
    expect(stale?.silentMin).toBe(3 * HOST_METRICS_MINUTES);
    expect(stale?.verdict).toBe('stale');
    expect(hostHealth([sample(2)], NOW)?.verdict).toBe('ok');
  });

  it('follows the host whose samples are newest', () => {
    const h = hostHealth(
      [
        sample(5, { host: 'old', load5: 9 }),
        sample(60, { host: 'old' }),
        sample(1)
      ],
      NOW
    );
    expect(h?.host).toBe('nuc');
    expect(h?.series).toHaveLength(1);
    expect(
      hostHealth([sample(1, { host: 'a' }), sample(2, { host: 'b' })], NOW)
        ?.host
    ).toBe('a');
  });

  it('measures the container against its limit when it has one', () => {
    const h = hostHealth(
      [sample(0, { cgroup_mem_current: 3 * GIB, cgroup_mem_max: 4 * GIB })],
      NOW
    );
    expect(h?.figures.container).toBeCloseTo(0.75);
    expect(h?.average.container).toBeCloseTo(0.75);
  });

  it('does not divide by a missing swap or core count', () => {
    const h = hostHealth(
      [sample(0, { swap_total: 0, swap_free: 0, cores: 0 })],
      NOW
    );
    expect(h?.figures.swap).toBe(0);
    expect(h?.figures.load).toBe(0);
  });
});

describe('planUsage', () => {
  const HOUR = 36e5;
  // A sample `ago` minutes before NOW of a window that resets `resetsIn` hours after NOW
  const sample = (
    kind: PlanUsageRow['kind'],
    resetsIn: number,
    used: number,
    ago = 0,
    over: Partial<PlanUsageRow> = {}
  ): PlanUsageRow => ({
    kind,
    resets_at: new Date(NOW.getTime() + resetsIn * HOUR).toISOString(),
    used_percentage: used,
    sampled_at: new Date(NOW.getTime() - ago * 6e4).toISOString(),
    host: 'mac',
    ...over
  });

  it('is null per window without rows', () => {
    expect(planUsage(null, NOW)).toEqual({ five_hour: null, seven_day: null });
    expect(planUsage([sample('seven_day', 100, 10)], NOW).five_hour).toBeNull();
  });

  it('projects a steady rate to the reset and is ok below the limit', () => {
    // Three hours into the window at 30 %: 10 % an hour, 50 % after the two hours left
    const w = planUsage([sample('five_hour', 2, 30)], NOW).five_hour;
    expect(w).toMatchObject({ reset: false, used: 30, verdict: 'ok' });
    if (!w || w.reset) throw new Error('expected a live window');
    expect(w.rate).toBeCloseTo(10);
    expect(w.projected).toBeCloseTo(50);
    expect(w.runsOutAt).toBeNull();
    expect(w.start.getTime()).toBe(NOW.getTime() - 3 * HOUR);
  });

  it('warns when the projection reaches 100 % and says when it runs out', () => {
    const w = planUsage([sample('five_hour', 2, 70)], NOW).five_hour;
    if (!w || w.reset) throw new Error('expected a live window');
    expect(w.verdict).toBe('warn');
    expect(w.projected).toBeCloseTo(116.67, 1);
    // 100 / (70 / 3) hours after the start
    expect(w.runsOutAt?.getTime()).toBeCloseTo(
      NOW.getTime() - 3 * HOUR + (300 / 70) * HOUR,
      -2
    );
    expect(w.runsOutAt && w.runsOutAt < w.resetsAt).toBe(true);
  });

  it('is bad once it is used up', () => {
    const w = planUsage([sample('five_hour', 2, 100)], NOW).five_hour;
    expect(w).toMatchObject({ verdict: 'bad', used: 100 });
  });

  it('has no run-out time without a rate', () => {
    const w = planUsage([sample('five_hour', 2, 0)], NOW).five_hour;
    expect(w).toMatchObject({ verdict: 'ok', runsOutAt: null, rate: 0 });
  });

  it('does not blow up on a sample at the very start of the window', () => {
    const w = planUsage([sample('five_hour', 5, 1)], NOW).five_hour;
    if (!w || w.reset) throw new Error('expected a live window');
    expect(w.rate).toBeCloseTo(10);
    expect(Number.isFinite(w.projected)).toBe(true);
  });

  it('counts no projection early in the window unless it is used up', () => {
    // Six minutes in at 3 %: the rate projects past 100 %, but a tenth of the window has not passed
    const w = planUsage([sample('five_hour', 4.9, 3)], NOW).five_hour;
    if (!w || w.reset) throw new Error('expected a live window');
    expect(w.projected).toBeGreaterThan(100);
    expect(w.runsOutAt).toBeNull();
    expect(w.verdict).toBe('ok');
    const spent = planUsage([sample('five_hour', 4.9, 100)], NOW).five_hour;
    expect(spent).toMatchObject({ verdict: 'bad', runsOutAt: null });
  });

  it('marks a sample older than 60 minutes stale and keeps its age', () => {
    const fresh = planUsage([sample('five_hour', 2, 30, 59)], NOW).five_hour;
    const old = planUsage([sample('five_hour', 2, 30, 90)], NOW).five_hour;
    expect(fresh).toMatchObject({ stale: false });
    expect(old).toMatchObject({ stale: true });
    expect(old && !old.reset && old.ageMin).toBeCloseTo(90);
  });

  it('reads a window past its reset as reset, without a used figure', () => {
    const w = planUsage([sample('five_hour', -1, 80, 120)], NOW).five_hour;
    expect(w).toEqual({
      kind: 'five_hour',
      reset: true,
      resetsAt: new Date(NOW.getTime() - HOUR)
    });
  });

  it('takes the window with the newest reset time and its newest sample', () => {
    const w = planUsage(
      [
        sample('five_hour', -1, 95, 200),
        sample('five_hour', 4, 5, 30),
        sample('five_hour', 4, 8, 10),
        sample('five_hour', 4, 6, 20)
      ],
      NOW
    ).five_hour;
    expect(w).toMatchObject({ reset: false, used: 8 });
  });

  it('reads a reset time that drifts by minutes as the same window', () => {
    const w = planUsage(
      [sample('five_hour', 4, 12, 5), sample('five_hour', 4.1, 10, 30)],
      NOW
    ).five_hour;
    expect(w).toMatchObject({ reset: false, used: 12 });
  });

  it('keeps the two kinds apart', () => {
    const plan = planUsage(
      [sample('five_hour', 2, 30), sample('seven_day', 100, 18)],
      NOW
    );
    expect(plan.five_hour).toMatchObject({ used: 30 });
    expect(plan.seven_day).toMatchObject({ used: 18 });
    // 7 d window: 68 h elapsed
    if (plan.seven_day && !plan.seven_day.reset)
      expect(plan.seven_day.rate).toBeCloseTo(18 / 68);
  });
});

describe('limits, nuc and versions in the model', () => {
  const GIB = 2 ** 30;
  const sample = (
    ago: number,
    over: Partial<HostMetricRow> = {}
  ): HostMetricRow => ({
    id: 1,
    host: 'nuc',
    at: new Date(NOW.getTime() - ago * 6e4).toISOString(),
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
    cgroup_mem_max: null,
    ...over
  });
  const run = (
    startedAgo: number,
    finishedAgo: number | null,
    ticket = 'COD-1'
  ): RunsPayload['rows'][number] => ({
    when: '2026-10-29 11:00',
    outcome: 'implemented',
    ticket,
    detail: '',
    started: new Date(NOW.getTime() - startedAgo * 6e4).toISOString(),
    finished:
      finishedAgo === null
        ? null
        : new Date(NOW.getTime() - finishedAgo * 6e4).toISOString()
  });
  const job = (over: Partial<NonNullable<RunsPayload['job']>> = {}) => ({
    line: 'every 10 min',
    minutes: 10,
    live: false,
    host: 'container' as const,
    rev: 'sha-abc1234',
    install: 'current' as const,
    items: '',
    effort: null,
    paused: false,
    ...over
  });
  const at = (
    runs: Partial<RunsPayload> | null,
    metrics: HostMetricRow[] | null = null
  ) =>
    model(
      withState((s) => {
        s.data.runs = runs ? runsPayload(runs) : null;
        s.data.hostMetrics = metrics;
      }),
      NOW
    );

  describe('limits', () => {
    it('takes the PR limit from the queue view', () => {
      expect(at({}).limits.prs).toEqual({ used: 2, max: 5 });
    });

    it('is the day spend against its cap, unpublished or paused or not', () => {
      expect(at({ job: job() }).limits).toMatchObject({
        effort: null,
        paused: false
      });
      expect(
        at({ job: job({ effort: { spent: 10, cap: 40 }, paused: true }) })
          .limits
      ).toMatchObject({
        effort: { spent: 10, cap: 40, share: 0.25 },
        paused: true
      });
    });

    it('reads a zero cap as no share, and no job as not paused', () => {
      expect(
        at({ job: job({ effort: { spent: 3, cap: 0 } }) }).limits.effort?.share
      ).toBe(0);
      expect(at({}).limits.paused).toBe(false);
    });
  });

  describe('nuc', () => {
    it('is null without a sample', () => {
      expect(at({}).nuc).toBeNull();
      expect(at({}).cpuDay).toBeNull();
    });

    it('reads the newest sample as shares, load1 per core', () => {
      const m = at({ rows: [run(60, 50)] }, [sample(10), sample(0)]);
      expect(m.nuc).toMatchObject({
        host: 'nuc',
        verdict: 'ok',
        memorySource: 'host',
        busy: false
      });
      expect(m.nuc?.cpu).toBeCloseTo(0.25);
      expect(m.nuc?.memory).toBeCloseTo(0.25);
      expect(m.nuc?.disk).toBeCloseTo(0.4);
    });

    it('prefers the container memory when both cgroup figures are set', () => {
      const m = at({}, [
        sample(0, { cgroup_mem_current: GIB, cgroup_mem_max: 2 * GIB })
      ]);
      expect(m.nuc?.memorySource).toBe('container');
      expect(m.nuc?.memory).toBeCloseTo(0.5);
      const half = at({}, [sample(0, { cgroup_mem_current: GIB })]);
      expect(half.nuc?.memorySource).toBe('host');
    });

    it('is busy while a run opened in the last 24 hours is open', () => {
      expect(at({ rows: [run(30, null)] }, [sample(0)]).nuc?.busy).toBe(true);
      expect(at({ rows: [run(25 * 60, null)] }, [sample(0)]).nuc?.busy).toBe(
        false
      );
    });
  });

  describe('cpuDay', () => {
    it('is the mean outside and inside runs, with the peak and its ticket', () => {
      const series = [
        sample(180, { load1: 0.4 }),
        sample(100, { load1: 0.8 }),
        sample(55, { load1: 3.2 }),
        sample(40, { load1: 1.6 }),
        sample(5, { load1: 0.4 })
      ];
      const d = cpuDay(series, [run(60, 30, 'COD-9')], NOW);
      expect(d.points.map((p) => p.cpu)).toEqual([0.1, 0.2, 0.8, 0.4, 0.1]);
      expect(d.bands).toEqual([
        {
          start: NOW.getTime() - 60 * 6e4,
          end: NOW.getTime() - 30 * 6e4,
          ticket: 'COD-9'
        }
      ]);
      expect(d.idle).toBeCloseTo((0.1 + 0.2 + 0.1) / 3);
      expect(d.inRuns).toBeCloseTo(0.6);
      expect(d.peak).toEqual({
        at: NOW.getTime() - 55 * 6e4,
        cpu: 0.8,
        ticket: 'COD-9'
      });
    });

    it('runs an open run to now and clips to the window', () => {
      const d = cpuDay([], [run(30 * 60, null), run(10, null, '')], NOW);
      expect(d.from).toBe(NOW.getTime() - 864e5);
      expect(d.bands[0]).toMatchObject({ start: d.from, end: NOW.getTime() });
      expect(d.bands[1]).toMatchObject({ end: NOW.getTime(), ticket: null });
      expect(d.idle).toBeNull();
      expect(d.inRuns).toBeNull();
      expect(d.peak).toBeNull();
    });

    it('leaves out samples and runs outside the window or unparsable', () => {
      const bad = { ...run(10, 5), started: 'later' };
      const d = cpuDay(
        [sample(25 * 60), sample(1)],
        [run(30 * 60, 26 * 60), bad],
        NOW
      );
      expect(d.points).toHaveLength(1);
      expect(d.bands).toEqual([]);
    });
  });

  describe('macToday', () => {
    const s = (
      id: string,
      host: string,
      kind: string,
      lastSeen: string
    ): SessionRow => ({
      id,
      host,
      kind,
      last_seen: lastSeen,
      state: null,
      detail: null
    });

    it('lists the Mac sessions seen since local midnight, oldest first', () => {
      const out = macToday(
        [
          s('n', 'nuc', 'implement', '2026-10-29T11:00:00'),
          s('m2', 'mac', 'attended', '2026-10-29T10:00:00'),
          s('m1', 'mac', 'implement', '2026-10-29T08:00:00'),
          s('old', 'mac', 'attended', '2026-10-28T23:59:00')
        ],
        'nuc',
        'mac',
        NOW
      );
      expect(out).toEqual([
        {
          id: 'm1',
          kind: 'implement',
          lastSeen: Date.parse('2026-10-29T08:00:00')
        },
        {
          id: 'm2',
          kind: 'attended',
          lastSeen: Date.parse('2026-10-29T10:00:00')
        }
      ]);
    });

    it('keeps an ended session, it is still today’s history', () => {
      const ended = {
        ...s('e', 'mac', 'attended', '2026-10-29T09:00:00'),
        state: 'ended'
      };
      expect(macToday([ended], 'nuc', 'mac', NOW).map((e) => e.id)).toEqual([
        'e'
      ]);
    });

    it('finds the Mac as any host but the NUC without a hand-back host', () => {
      const rows = [
        s('n', 'nuc', 'implement', '2026-10-29T11:00:00'),
        s('m', 'mac', 'attended', '2026-10-29T10:00:00')
      ];
      expect(macToday(rows, null, null, NOW).map((e) => e.id)).toEqual(['m']);
      expect(macToday(rows.slice(0, 1), 'nuc', null, NOW)).toEqual([]);
      expect(macToday(null, null, null, NOW)).toEqual([]);
    });
  });

  describe('versions', () => {
    const OLD = 'abc1234' + '0'.repeat(33);
    const NEW = 'def5678' + '0'.repeat(33);

    it('says behind, current or unknown for the image', () => {
      expect(versions(job(), { image: NEW, desk: null }, null).image).toEqual({
        state: 'behind',
        runs: 'sha-abc1234',
        main: 'sha-def5678'
      });
      expect(
        versions(job(), { image: OLD, desk: null }, null).image.state
      ).toBe('current');
      expect(versions(job(), { image: null, desk: null }, null).image).toEqual({
        state: 'unknown',
        runs: 'sha-abc1234',
        main: null
      });
      expect(
        versions(job({ host: 'launchd' }), { image: NEW, desk: null }, null)
          .image
      ).toEqual({ state: 'unknown', runs: null, main: 'sha-def5678' });
    });

    it('says the same for the desk, unknown for a local build', () => {
      const main = { image: null, desk: NEW };
      expect(versions(null, main, OLD).desk).toEqual({
        state: 'behind',
        runs: 'sha-abc1234',
        main: 'sha-def5678'
      });
      expect(versions(null, { image: null, desk: OLD }, OLD).desk.state).toBe(
        'current'
      );
      expect(versions(null, main, null).desk.state).toBe('unknown');
    });

    it('carries the install state of the Job line', () => {
      expect(versions(job({ install: 'stale' }), null, null).install).toBe(
        'stale'
      );
      expect(versions(null, null, null).install).toBeNull();
    });
  });
});

describe('usageBurn', () => {
  const HOUR = 36e5;
  const top = Math.floor(NOW.getTime() / HOUR) * HOUR;
  // An hour row `ago` whole hours before the current hour
  const row = (
    ago: number,
    cost: number,
    over: Partial<UsageHourRow> = {}
  ): UsageHourRow => ({
    hour: new Date(top - ago * HOUR).toISOString(),
    host: 'mac',
    model: 'opus',
    role: 'planning',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: cost,
    updated_at: NOW.toISOString(),
    ...over
  });

  it('zero-fills 24 buckets, oldest first, ending with the current hour', () => {
    const b = usageBurn(null, NOW);
    expect(b.hourly).toHaveLength(24);
    expect(b.hourly[23].hour).toBe(top);
    expect(b.hourly[0].hour).toBe(top - 23 * HOUR);
    expect(b.hourly.every((h) => h.cost === 0)).toBe(true);
    expect(b.fiveHour.total).toBe(0);
    expect(b.sevenDay.total).toBe(0);
  });

  it('sums every host and model into the hour, and leaves older hours out', () => {
    const b = usageBurn(
      [
        row(0, 1),
        row(0, 2, { host: 'nuc', model: 'sonnet' }),
        row(5, 4),
        row(24, 8),
        row(30, 16)
      ],
      NOW
    );
    expect(b.hourly[23].cost).toBe(3);
    expect(b.hourly[18].cost).toBe(4);
    expect(b.hourly.reduce((n, h) => n + h.cost, 0)).toBe(7);
  });

  it('totals roles over the last 5 hours without a window, and over 7 days', () => {
    const b = usageBurn(
      [
        row(0, 1),
        row(4, 2, { role: 'implementing' }),
        row(5, 4, { role: 'other' }),
        row(6, 32),
        row(24 * 6, 8, { role: 'orchestrating' }),
        row(24 * 8, 16)
      ],
      NOW
    );
    // The hour that ends at the window's edge is still inside, the one before it is not
    expect(b.fiveHour).toEqual({
      planning: 1,
      orchestrating: 0,
      implementing: 2,
      other: 4,
      total: 7
    });
    expect(b.sevenDay).toMatchObject({
      planning: 33,
      orchestrating: 8,
      implementing: 2,
      other: 4,
      total: 47
    });
  });

  it('starts the 5-hour totals at the window when it is known', () => {
    const plan = planUsage(
      [
        {
          kind: 'five_hour',
          resets_at: new Date(NOW.getTime() + 1 * HOUR).toISOString(),
          used_percentage: 10,
          sampled_at: NOW.toISOString(),
          host: 'mac'
        }
      ],
      NOW
    );
    // The window began four hours before NOW, so the row from five hours ago is out
    const b = usageBurn([row(0, 1), row(3, 2), row(5, 4)], NOW, plan.five_hour);
    expect(b.fiveHour.total).toBe(3);
  });

  it('counts an unknown role as other', () => {
    const b = usageBurn([row(0, 5, { role: 'mystery' })], NOW);
    expect(b.fiveHour.other).toBe(5);
  });
});
