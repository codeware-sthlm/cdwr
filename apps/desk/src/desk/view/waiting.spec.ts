import { describe, expect, it } from 'vitest';

import type { SnoozeRow } from '../../supabase';
import { model } from '../model';
import type { DeskState } from '../state';
import type { QueueGap, QueueParked, WatchEntry } from '../types';

import { NOW, activity, filled, gap, runs, view } from './fixtures';
import { headline } from './session';
import {
  copilotView,
  countedRows,
  fixCommand,
  forgetLabelled,
  heldText,
  isRulesetHeld,
  isSnoozed,
  labelState,
  mergeBlocker,
  reviewPathsText,
  rowLabel,
  waitRows
} from './waiting';

describe('waiting card and queue sheets', () => {
  it('list what waits on the viewer, furthest along first', () => {
    const state = filled();
    state.data.activity = {
      ...activity,
      rows: [
        {
          when: '2026-10-29 10:00',
          ticket: 'COD-4',
          actor: 'agent',
          change: 'comment: **Agent: plan ready**'
        }
      ]
    };
    const m = model(state, NOW);
    expect(waitRows(m, state.details, NOW).map((r) => [r.id, r.kind])).toEqual([
      ['COD-3', 'review'],
      ['COD-5', 'hand-offs'],
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea']
    ]);
  });
});

describe('gaps on the waiting rows', () => {
  const rows = (audit: QueueGap[]) => {
    const state = filled();
    state.data.runs = runs(view({ audit }));
    const m = model(state, NOW);
    return waitRows(m, state.details, NOW);
  };

  it('puts a blocking gap first, labelled by its kind, with its fix', () => {
    const r = rows([gap('COD-898', 'ready-planned')]);
    expect(r[0]).toMatchObject({
      id: 'COD-898',
      kind: 'gap',
      snoozed: false,
      gap: {
        kind: 'ready-planned',
        what: 'COD-898 is ready-planned',
        tickets: [{ id: 'COD-898' }]
      }
    });
    expect(rowLabel(r[0])).toBe('gap · ready-planned');
    expect(fixCommand(r[0].gap?.fix ?? '')).toBe('cdwr agent attend COD-898');
  });

  it('folds closed tickets with a label into one cleanup row after the ideas', () => {
    const r = rows([
      gap('COD-801', 'label-on-closed'),
      gap('COD-802', 'label-on-closed'),
      gap('COD-898', 'ready-planned')
    ]);
    expect(r.map((x) => [x.id, x.kind])).toEqual([
      ['COD-898', 'gap'],
      ['COD-3', 'review'],
      ['COD-5', 'hand-offs'],
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea'],
      ['cleanup', 'cleanup']
    ]);
    const cleanup = r[r.length - 1];
    expect(rowLabel(cleanup)).toBe('cleanup · 2');
    expect(cleanup.gap?.tickets.map((t) => t.id)).toEqual([
      'COD-801',
      'COD-802'
    ]);
    expect(cleanup.gap?.fix).toBe(
      'An attended session cleans it up, or remove the label'
    );
    // Each gap row counts, the cleanup row once
    expect(
      countedRows(r).filter((x) => x.kind === 'gap' || x.kind === 'cleanup')
    ).toHaveLength(2);
  });

  it('adds no gap row for a ticket another row lists, so it counts once', () => {
    const r = rows([gap('COD-6', 'unlabelled')]);
    expect(r.filter((x) => x.id === 'COD-6').map((x) => x.kind)).toEqual([
      'ready to label'
    ]);
  });

  it('lists a closed ticket with a second gap only in the cleanup row', () => {
    const r = rows([
      gap('COD-801', 'label-on-closed'),
      gap('COD-801', 'two-labels')
    ]);
    expect(r.filter((x) => x.kind === 'gap')).toEqual([]);
    expect(rowLabel(r[r.length - 1])).toBe('cleanup · 1');
  });

  it('gives a ticket with two gaps one row, the first gap', () => {
    const r = rows([
      gap('COD-800', 'two-labels'),
      gap('COD-800', 'review-no-pr')
    ]);
    expect(r.filter((x) => x.kind === 'gap').map((x) => x.gap?.kind)).toEqual([
      'two-labels'
    ]);
  });

  it('leaves candidates out', () => {
    expect(
      rows([gap('COD-7', 'stale', { candidate: true })]).some(
        (x) => x.kind === 'gap'
      )
    ).toBe(false);
  });

  it('takes the title from the gap for a ticket outside the index', () => {
    const r = rows([gap('COD-700', 'two-labels', { title: 'Canceled one' })]);
    expect(r[0].title).toBe('Canceled one');
  });

  it('copies no command from a fix without a code span', () => {
    expect(fixCommand('Keep one of agent:ready, agent:review')).toBeNull();
  });
});

describe('a review row held by the merge', () => {
  const rows = (
    held: string | null,
    extra: { approved?: boolean; reviewPaths?: string[] | null } = {}
  ) => {
    const state = filled();
    state.data.runs = runs(
      view({
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-3', kind: 'pr', pr: 7, held, ...extra }]
        }
      })
    );
    const m = model(state, NOW);
    return waitRows(m, state.details, NOW).filter((r) => r.kind === 'review');
  };

  it('carries the verdict from the queue view', () => {
    expect(rows('a hold')).toMatchObject([{ id: 'COD-3', held: 'a hold' }]);
  });

  it('has none without one', () => {
    expect(rows(null)).toMatchObject([{ id: 'COD-3', held: null }]);
  });

  it('carries the approval and the protected paths', () => {
    expect(
      rows('a hold', { approved: true, reviewPaths: ['a.ts'] })
    ).toMatchObject([{ approved: true, reviewPaths: ['a.ts'] }]);
  });

  it('is not approved and has no paths without them', () => {
    expect(rows('a hold')).toMatchObject([
      { approved: false, reviewPaths: null }
    ]);
  });
});

describe('isRulesetHeld', () => {
  it('is true for the ruleset verdict only', () => {
    expect(isRulesetHeld("the ruleset requires Håkan's review")).toBe(true);
    expect(isRulesetHeld('a hold')).toBe(false);
    expect(isRulesetHeld(null)).toBe(false);
  });
});

describe('reviewPathsText', () => {
  it('lists up to 3 paths', () => {
    expect(reviewPathsText(['a', 'b', 'c'])).toBe('Protected paths: a, b, c');
  });

  it('lists the first 3 and counts the rest', () => {
    expect(reviewPathsText(['a', 'b', 'c', 'd', 'e'])).toBe(
      'Protected paths: a, b, c, +2 more'
    );
  });

  it('says they could not be read when null', () => {
    expect(reviewPathsText(null)).toBe('Protected paths could not be read');
  });

  it('says no file matched when the rules were read', () => {
    expect(reviewPathsText([])).toBe(
      'No changed file matches the protected paths'
    );
  });
});

describe('heldText', () => {
  it('names the ruleset when it is what blocks the merge', () => {
    expect(heldText("the ruleset requires Håkan's review")).toBe(
      "Needs your approval on GitHub: main's ruleset requires your review"
    );
  });

  it('gives any other verdict as it is', () => {
    expect(heldText('a hold')).toBe('Merge held: a hold');
  });

  it('tells to press Merge when the PR is approved and another verdict holds', () => {
    expect(heldText('a hold', true)).toBe(
      'Approved on GitHub, press Merge. Held: a hold'
    );
  });

  it('keeps naming the ruleset when approved', () => {
    expect(heldText("the ruleset requires Håkan's review", true)).toBe(
      "Needs your approval on GitHub: main's ruleset requires your review"
    );
  });
});

describe('a stalled wait on Copilot', () => {
  // NOW is 12:00
  const parked = (over: Partial<QueueParked>): QueueParked => ({
    ticket: 'COD-2',
    wait: 'copilot',
    pr: 5,
    since: '2026-10-29T11:50:00',
    resolved: false,
    copilot: 'none',
    copilotAsked: null,
    ...over
  });
  const rows = (p: QueueParked) => {
    const state = filled();
    state.data.runs = runs(view({ parked: [p] }));
    const m = model(state, NOW);
    return waitRows(m, state.details, NOW).filter((r) => r.id === p.ticket);
  };

  it('waits on you with why, when the request failed', () => {
    const asked = { at: '2026-10-29T11:51:00', ok: false, why: 'no seat' };
    expect(
      rows(parked({ copilotAsked: asked, since: '2026-10-29T11:59:00' }))
    ).toMatchObject([
      {
        kind: 'review',
        pr: 5,
        wait: 'Copilot request failed: no seat'
      }
    ]);
  });

  it('waits on you when none was made within five minutes', () => {
    expect(rows(parked({}))).toMatchObject([
      { kind: 'review', wait: 'no Copilot request was made' }
    ]);
  });

  it('does not before five minutes have passed', () => {
    expect(rows(parked({ since: '2026-10-29T11:56:00' }))).toEqual([]);
  });

  it('does not once Copilot was asked, reviewed or the wait resolved', () => {
    const ok = { at: '2026-10-29T11:51:00', ok: true, why: null };
    expect(rows(parked({ copilotAsked: ok }))).toEqual([]);
    expect(rows(parked({ copilot: 'requested' }))).toEqual([]);
    expect(rows(parked({ copilot: 'reviewed' }))).toEqual([]);
    expect(rows(parked({ copilot: null }))).toEqual([]);
    expect(rows(parked({ resolved: true }))).toEqual([]);
  });

  it('does not for a wait on CI', () => {
    expect(rows(parked({ wait: 'ci' }))).toEqual([]);
  });

  it('gives the reason to the review row of an open PR parked on Copilot', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        parked: [parked({ ticket: 'COD-3' })],
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-3', kind: 'pr', pr: 7 }]
        }
      })
    );
    const m = model(state, NOW);
    const r = waitRows(m, state.details, NOW).filter((x) => x.id === 'COD-3');
    expect(r).toHaveLength(1);
    expect(r[0].wait).toContain('no Copilot request was made');
  });
});

describe('pull requests on the waiting rows', () => {
  const withPr = (pr: number | null) => ({
    steps: 0,
    done: 0,
    next: null,
    idea: null,
    blockedBy: [],
    pr,
    prAt: null
  });

  it('link the PR beside a plan and a question row, outside the row link', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-8', kind: 'question' },
            { ticket: 'COD-9', kind: 'plan' }
          ],
          label: [],
          after: []
        }
      })
    );
    state.details.set('COD-4', withPr(21));
    state.details.set('COD-8', withPr(22));
    const m = model(state, NOW);
    const rows = Object.fromEntries(
      waitRows(m, state.details, NOW).map((r) => [r.id, r.pr])
    );
    expect(rows).toMatchObject({
      'COD-4': 21,
      'COD-8': 22,
      'COD-9': null,
      'COD-50': null
    });
  });

  it('order every kind furthest along first, approved plans last and uncounted', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        blocked: [{ ticket: 'COD-9', blockers: ['COD-2'] }],
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-8', kind: 'question' }
          ],
          label: [{ ticket: 'COD-6', parent: 'COD-<1>', blockers: [] }],
          after: [
            { ticket: 'COD-3', kind: 'pr', pr: 7 },
            { ticket: 'COD-5', kind: 'handoffs', items: ['a', 'b'] }
          ]
        }
      })
    );
    const m = model(state, NOW);
    const rows = waitRows(m, state.details, NOW);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ['COD-3', 'review'],
      ['COD-5', 'hand-offs'],
      ['COD-8', 'question'],
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea'],
      ['COD-9', 'approved']
    ]);
    expect(countedRows(rows)).toHaveLength(6);
  });

  it('keep a parked PR listed, with its PR number, blockers and wait', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        parked: [{ ticket: 'COD-3', wait: 'ci', pr: 7 }],
        table: {
          before: [{ ticket: 'COD-4', kind: 'plan' }],
          label: [],
          after: [
            { ticket: 'COD-3', kind: 'pr', pr: 7 },
            { ticket: 'COD-2', kind: 'pr', pr: 5 }
          ]
        }
      })
    );
    state.details.set('COD-3', { ...withPr(7), blockedBy: ['COD-2', 'COD-1'] });
    state.details.set('COD-2', withPr(5));
    state.details.set('COD-4', { ...withPr(null), blockedBy: ['COD-1'] });
    const m = model(state, NOW);
    const rows = waitRows(m, state.details, NOW);
    expect(rows.find((r) => r.id === 'COD-3')).toMatchObject({
      kind: 'review',
      pr: 7,
      blockers: 'COD-2 · PR 5, COD-1'
    });
    expect(rows.find((r) => r.id === 'COD-3')?.wait).toBe(
      'Review fixes: waits on CI'
    );
  });
});

describe('snoozed waiting rows', () => {
  const snooze = (
    ticket: string,
    kind: string,
    event_at: string | null = null
  ): SnoozeRow => ({
    ticket,
    kind,
    event_at,
    at: NOW.toISOString(),
    actor: 'desk'
  });
  const T1 = '2026-10-29T10:00:00.000Z';
  const T2 = '2026-10-29T11:00:00.000Z';

  it.each([
    ['no snooze', 'review', null, [], false],
    [
      'the same kind, no events either side',
      'review',
      null,
      [snooze('COD-1', 'review')],
      true
    ],
    ['the kind changed', 'plan', null, [snooze('COD-1', 'review')], false],
    [
      'a newer gate event',
      'review',
      T2,
      [snooze('COD-1', 'review', T1)],
      false
    ],
    [
      'a gate event no newer',
      'review',
      T1,
      [snooze('COD-1', 'review', T1)],
      true
    ],
    [
      'an older gate event',
      'review',
      T1,
      [snooze('COD-1', 'review', T2)],
      true
    ],
    [
      'a gate event the snooze never saw',
      'review',
      T1,
      [snooze('COD-1', 'review')],
      false
    ],
    [
      'another ticket snoozed',
      'review',
      null,
      [snooze('COD-2', 'review')],
      false
    ]
  ] as const)('isSnoozed: %s', (_name, kind, gateAt, snoozes, expected) => {
    expect(isSnoozed({ id: 'COD-1', kind }, gateAt, snoozes)).toBe(expected);
  });

  /** The filled state with no activity, so every gate is null; COD-3 and COD-50 are snoozed, COD-4 under a kind it no longer has */
  const snoozed = (): DeskState => {
    const s = filled();
    s.data.activity = { ...activity, rows: [] };
    s.data.snoozes = [
      snooze('COD-3', 'review'),
      snooze('COD-50', 'idea'),
      snooze('COD-4', 'question')
    ];
    return s;
  };

  it('marks the snoozed rows, those whose kind still matches', () => {
    const s = snoozed();
    const m = model(s, NOW);
    expect(waitRows(m, s.details, NOW).map((r) => [r.id, r.snoozed])).toEqual([
      ['COD-3', true],
      ['COD-5', false],
      ['COD-4', false],
      ['COD-6', false],
      ['COD-50', true]
    ]);
  });

  it('leaves snoozed rows out of the badge and the session headline', () => {
    const s = snoozed();
    const m = model(s, NOW);
    expect(countedRows(waitRows(m, s.details, NOW)).map((r) => r.id)).toEqual([
      'COD-5',
      'COD-4',
      'COD-6'
    ]);
    s.data.runs = runs(
      view({
        next: [],
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-5', kind: 'handoffs', items: ['a'] }]
        }
      })
    );
    s.data.snoozes = [snooze('COD-5', 'hand-offs')];
    s.data.ideas = [];
    expect(headline(model(s, NOW), s.details, NOW).text).toEqual([
      'Nothing for the agent, and nothing waits on you.'
    ]);
  });

  describe('Label button', () => {
    const t = NOW.getTime();

    it('forgets a label once the queue no longer lists the ticket', () => {
      const labelled = new Map([
        ['COD-6', 1],
        ['COD-7', 2]
      ]);
      forgetLabelled(labelled, null);
      expect([...labelled.keys()]).toEqual(['COD-6', 'COD-7']);
      forgetLabelled(labelled, [{ ticket: 'COD-7' }]);
      expect([...labelled.keys()]).toEqual(['COD-7']);
    });

    it('reads the state from the controls', () => {
      const c = snoozed().controls;
      expect(labelState('COD-6', c, t)).toBe('idle');
      c.labelConfirm.set('COD-6', t - 1000);
      expect(labelState('COD-6', c, t)).toBe('confirming');
      expect(labelState('COD-6', c, t + 5000)).toBe('idle');
      c.labelling.add('COD-6');
      expect(labelState('COD-6', c, t)).toBe('labelling');
      c.labelling.clear();
      c.labelled.set('COD-6', t - 1000);
      expect(labelState('COD-6', c, t)).toBe('labelled');
      expect(labelState('COD-6', c, t + 3 * 3600_000)).toBe('idle');
      // A row whose gate moved on after the label came back as ready to label: live again
      c.labelConfirm.delete('COD-6');
      expect(labelState('COD-6', c, t, new Date(t - 2000).toISOString())).toBe(
        'labelled'
      );
      expect(labelState('COD-6', c, t, new Date(t).toISOString())).toBe('idle');
      c.labelNotes.set('COD-6', 'no');
      expect(labelState('COD-6', c, t + 3 * 3600_000)).toEqual({ note: 'no' });
    });
  });

  describe('mergeBlocker and copilotView', () => {
    const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
      pr: 7,
      state: 'open',
      unresolved: 0,
      threads: 0,
      conflicting: false,
      draft: false,
      mergeable: 'MERGEABLE',
      ci: 'SUCCESS',
      copilot: 'none',
      at: null,
      ...over
    });

    it.each([
      ['nothing in the way', {}, null],
      ['in the merge queue', { state: 'queued' }, 'already in the merge queue'],
      [
        'queued beats a conflict',
        { state: 'queued', conflicting: true },
        'already in the merge queue'
      ],
      ['a conflict state', { state: 'conflicting' }, 'conflicts with main'],
      ['a conflict flag', { conflicting: true }, 'conflicts with main'],
      [
        'conflicts not checked yet',
        { conflicting: null },
        'GitHub has not checked for conflicts yet'
      ],
      [
        'mergeability unknown',
        { mergeable: 'UNKNOWN' },
        'GitHub has not checked for conflicts yet'
      ],
      ['a draft', { draft: true }, 'PR is a draft'],
      [
        'a draft in the merge queue',
        { draft: true, state: 'queued' },
        'PR is a draft'
      ],
      ['no ci data', { ci: null }, 'no check data yet'],
      ['no thread data', { threads: null }, 'no check data yet'],
      ['checks pending', { ci: 'PENDING' }, 'checks pending'],
      ['checks failing', { ci: 'FAILURE' }, 'checks failure'],
      ['checks erroring', { ci: 'ERROR' }, 'checks error'],
      ['checks expected', { ci: 'EXPECTED' }, 'checks expected'],
      ['one thread', { threads: 1 }, '1 unresolved thread'],
      ['threads', { threads: 3 }, '3 unresolved threads'],
      [
        'checks before threads',
        { ci: 'PENDING', threads: 2 },
        'checks pending'
      ],
      ['merged', { state: 'merged' }, 'PR is merged'],
      ['closed', { state: 'closed' }, 'PR is closed']
    ] as const)('mergeBlocker: %s', (_name, over, expected) => {
      expect(mergeBlocker(entry(over))).toBe(expected);
    });

    it.each([
      ['none', 'button'],
      ['requested', { note: 'Copilot asked' }],
      ['reviewed', { note: 'Copilot reviewed' }],
      [null, null]
    ] as const)('copilotView: %s', (copilot, expected) => {
      expect(copilotView(entry({ copilot }))).toEqual(expected);
    });
  });
});
