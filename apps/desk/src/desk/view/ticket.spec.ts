import { describe, expect, it } from 'vitest';

import { model } from '../model';
import type { DeskState } from '../state';

import { NOW, ticketDesk as desk, runs, view } from './fixtures';
import { ACTIVITY_MAX, ticketState } from './ticket';

const stateOf = (s: DeskState, id: string) =>
  ticketState(model(s, NOW, null), s, id);

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
      candidates: null,
      session: { id: 's1', host: 'nuc', kind: 'implement', state: 'alive' },
      plan: { done: 2, steps: 4, next: 'Step 3' },
      snooze: { ticket: 'COD-3', kind: 'review' },
      spend: { planning: 1, orchestrating: 2, implementing: 3, total: 6 }
    });
    expect(t.activity).not.toBeNull();
  });

  it('keeps the candidates apart from the real gaps', () => {
    const s = desk();
    s.data.runs = runs(
      view({
        audit: [
          {
            id: 'g1',
            ticket: 'COD-50',
            kind: 'stale',
            what: 'PR is stale',
            fix: 'rebase it'
          },
          {
            id: 'g2',
            ticket: 'COD-50',
            kind: 'untouched',
            what: 'COD-50 has not moved',
            fix: 'Check it',
            candidate: true
          }
        ]
      })
    );
    const t = stateOf(s, 'COD-50');
    expect(t.gaps?.map((g) => g.id)).toEqual(['g1']);
    expect(t.candidates?.map((g) => g.id)).toEqual(['g2']);
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
      candidates: null,
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

  it.each([
    ['COD-3', 'review'],
    ['COD-4', 'plan'],
    ['COD-5', 'hand-offs'],
    ['COD-1', null]
  ] as const)('says what %s waits on Håkan for: %s', (id, waiting) => {
    expect(stateOf(desk(), id).queue?.waiting ?? null).toBe(waiting);
  });

  it('reads a before row that is no plan as a question', () => {
    const s = desk();
    s.data.runs = runs(
      view({
        table: {
          before: [{ ticket: 'COD-4', kind: 'question' }],
          label: [],
          after: []
        }
      })
    );
    expect(stateOf(s, 'COD-4').queue?.waiting).toBe('question');
  });

  it("leaves out a watch entry of the ticket's older PR", () => {
    const s = desk();
    const entry = s.data.runs?.watches[0]?.watch['COD-3'];
    if (entry) entry.pr = 6;
    const t = stateOf(s, 'COD-3');
    expect(t.pr).toBeNull();
    // The events still follow the current PR 7
    expect(t.activity?.some((e) => e.text.startsWith('PR 7 '))).toBe(true);
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
      candidates: null,
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
