import { describe, expect, it } from 'vitest';

import type { Issue, StatusType } from '../linear';
import type { RunsPayload } from '../supabase';

import {
  agentState,
  byQueue,
  ideaVerdict,
  isProblem,
  mergeOrder,
  model,
  openIssues,
  prOf,
  shipped
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
          host: 'launchd',
          rev: null,
          install: 'current',
          items: ''
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
          host: 'launchd',
          rev: null,
          install: 'stale',
          items: 'run.sh'
        }
      });
      expect(m.installStale).toBe(true);
    });

    const row = (when: string, outcome: string) => ({
      when,
      outcome,
      ticket: '',
      detail: ''
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
                  host: null,
                  rev: null,
                  install: 'current',
                  items: ''
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
    it('measures the age of the document and counts the last 24 hours', () => {
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
