import { describe, expect, it } from 'vitest';

import { model } from '../model';
import type { DeskState } from '../state';

import { NOW, filled, runs, usage, view } from './fixtures';
import { ACTIVITY_MAX, ticketState } from './ticket';

const stateOf = (s: DeskState, id: string) =>
  ticketState(model(s, NOW, null), s, id);

const minute = (i: number): string =>
  `2026-10-29 10:${String(i).padStart(2, '0')}`;

/** The filled desk with COD-3 held by every part: review, tree, PR, gap, session, plan, snooze, spend and history */
const desk = (): DeskState => {
  const s = filled();
  s.data.runs = {
    ...runs(
      view({
        session: {
          state: 'alive',
          ticket: 'COD-3',
          id: 's1',
          detail: 'working'
        },
        held: { tickets: ['COD-3'], free: [] },
        audit: [
          {
            id: 'g1',
            ticket: 'COD-3',
            kind: 'stale',
            what: 'PR is stale',
            fix: 'rebase it'
          }
        ],
        tree: [
          {
            ticket: 'COD-10',
            title: 'The root',
            state: 'started',
            label: null,
            pr: null,
            blockers: [],
            gaps: [],
            children: [
              {
                ticket: 'COD-3',
                title: 'Title of COD-3',
                state: 'started',
                label: 'agent:review',
                pr: 7,
                blockers: [],
                gaps: ['stale'],
                children: []
              },
              {
                ticket: 'COD-11',
                title: 'The sibling',
                state: 'unstarted',
                label: null,
                pr: null,
                blockers: [],
                gaps: [],
                children: []
              }
            ]
          }
        ]
      })
    ),
    watches: [
      {
        host: 'nuc',
        at: '2026-10-29T11:55:00Z',
        watch: {
          'COD-3': {
            pr: 7,
            state: 'open',
            unresolved: 1,
            threads: 1,
            conflicting: false,
            mergeable: 'MERGEABLE',
            ci: 'SUCCESS',
            copilot: 'reviewed'
          }
        }
      }
    ]
  };
  s.data.sessions = [
    {
      id: 's1',
      host: 'nuc',
      kind: 'implement',
      last_seen: '2026-10-29T11:58:00Z',
      state: 'alive',
      detail: null
    }
  ];
  s.details.set('COD-3', {
    steps: 4,
    done: 2,
    next: 'Step 3',
    idea: null,
    blockedBy: [],
    pr: 7,
    prAt: null
  });
  s.data.snoozes = [
    {
      ticket: 'COD-3',
      kind: 'review',
      event_at: null,
      at: '2026-10-29T11:00:00Z',
      actor: 'desk'
    }
  ];
  s.data.usage = {
    ...usage,
    tickets: [
      {
        ticket: 'COD-3',
        planning: 1,
        orchestrating: 2,
        implementing: 3,
        total: 6,
        output: 1,
        cacheRead: 1
      }
    ]
  };
  s.data.activity = {
    updated: '2026-10-29 11:50',
    header: '',
    dropped: '',
    rows: [
      ...Array.from({ length: ACTIVITY_MAX + 2 }, (_, i) => ({
        when: minute(i),
        ticket: 'COD-3',
        actor: 'agent',
        change: `change ${i}`
      })).reverse(),
      { when: minute(30), ticket: 'COD-4', actor: 'agent', change: 'other' }
    ]
  };
  s.data.githubEvents = [
    {
      subject: 'pr-7',
      pr: 7,
      action: 'check_suite:completed:success',
      updated_at: '2026-10-29T10:05:00'
    },
    {
      subject: 'pr-8',
      pr: 8,
      action: 'pull_request:opened',
      updated_at: '2026-10-29T10:50:00'
    }
  ];
  return s;
};

describe('ticketState', () => {
  it('carries every part for a ticket the desk holds fully', () => {
    const t = stateOf(desk(), 'COD-3');
    expect(t).toMatchObject({
      id: 'COD-3',
      url: 'https://linear.app/codeware/issue/COD-3',
      known: true,
      linear: {
        title: 'Title of COD-3',
        status: { name: 'Todo', type: 'unstarted' },
        labels: ['agent:review'],
        priority: 3
      },
      queue: { held: true, review: { pr: 7 }, handoffs: [] },
      tree: {
        parent: { id: 'COD-10', title: 'The root' },
        siblings: [{ id: 'COD-11', title: 'The sibling' }],
        children: [],
        truncated: false
      },
      pr: { host: 'nuc', entry: { pr: 7, ci: 'SUCCESS', unresolved: 1 } },
      gaps: [{ kind: 'stale', fix: 'rebase it' }],
      session: { id: 's1', host: 'nuc', kind: 'implement', state: 'alive' },
      plan: { done: 2, steps: 4, next: 'Step 3' },
      snooze: { ticket: 'COD-3', kind: 'review' },
      spend: { planning: 1, orchestrating: 2, implementing: 3, total: 6 }
    });
    expect(t.activity).not.toBeNull();
  });

  it('is null in each part the desk holds nothing for', () => {
    const s = desk();
    // COD-50 is an idea: Linear knows it, nothing else does
    expect(stateOf(s, 'COD-50')).toMatchObject({
      known: true,
      linear: { title: 'Title of COD-50' },
      queue: null,
      tree: null,
      pr: null,
      gaps: null,
      session: null,
      plan: null,
      snooze: null,
      spend: null,
      activity: null
    });
  });

  it.each([
    ['COD-1', 'next'],
    ['COD-2', 'parked'],
    ['COD-6', 'toLabel'],
    ['COD-5', 'handoffs']
  ] as const)('reads %s from the queue as %s', (id, part) => {
    const q = stateOf(desk(), id).queue;
    expect(q).not.toBeNull();
    expect(q?.[part]).toBeTruthy();
  });

  it('builds the URL and knows nothing for an unknown id', () => {
    expect(stateOf(desk(), 'COD-999')).toEqual({
      id: 'COD-999',
      url: 'https://linear.app/codeware/issue/COD-999',
      known: false,
      linear: null,
      queue: null,
      tree: null,
      pr: null,
      gaps: null,
      session: null,
      plan: null,
      snooze: null,
      spend: null,
      activity: null
    });
  });

  it('gives a root its children and no parent', () => {
    expect(stateOf(desk(), 'COD-10').tree).toEqual({
      parent: null,
      siblings: [],
      children: [
        { id: 'COD-3', title: 'Title of COD-3', state: 'started' },
        { id: 'COD-11', title: 'The sibling', state: 'unstarted' }
      ],
      truncated: false
    });
  });

  it('keeps the newest ACTIVITY_MAX events, newest first, activity and GitHub mixed', () => {
    const events = stateOf(desk(), 'COD-3').activity ?? [];
    expect(events).toHaveLength(ACTIVITY_MAX);
    expect(events.map((e) => e.at)).toEqual(
      [...events.map((e) => e.at)].sort((a, b) => b - a)
    );
    // The PR's event of 10:05 is in; PR 8's, which belongs to no ticket here, is not
    expect(events.filter((e) => e.source === 'github')).toEqual([
      {
        at: Date.parse('2026-10-29T10:05:00'),
        text: 'PR 7 check_suite:completed:success',
        source: 'github'
      }
    ]);
    expect(events[0].text).toBe(`change ${ACTIVITY_MAX + 1}`);
    expect(events.some((e) => e.text === 'other')).toBe(false);
  });
});
