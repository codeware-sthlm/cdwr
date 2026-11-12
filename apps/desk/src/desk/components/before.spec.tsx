// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DeskCommandRow, SnoozeRow } from '../../supabase';
import { model } from '../model';
import { type DeskState, createState } from '../state';
import { NOW, activity, filled, runs, view } from '../view/fixtures';

import { BeforeSheet, type WaitActions } from './before';

const noop = () => undefined;

const fakeActions = () => ({
  snooze: vi.fn(),
  wake: vi.fn(),
  label: vi.fn(),
  pr: vi.fn()
});

type Opts = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  actions?: WaitActions;
};

const sheetEl = (s: DeskState, o: Opts = {}) => (
  <BeforeSheet
    m={model(s, NOW)}
    state={s}
    now={NOW}
    open={o.open ?? false}
    onOpenChange={o.onOpenChange ?? noop}
    actions={o.actions ?? fakeActions()}
  />
);

const sheet = (s: DeskState, o: Opts = {}) => render(sheetEl(s, o)).container;

const on = (s: DeskState): DeskState => {
  s.controls.target = {
    supabaseUrl: 'https://x.supabase.co',
    controlToken: 't'
  };
  return s;
};

const snooze = (ticket: string, kind: string): SnoozeRow => ({
  ticket,
  kind,
  event_at: null,
  at: NOW.toISOString(),
  actor: 'desk'
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

const withPr = (pr: number | null) => ({
  steps: 0,
  done: 0,
  next: null,
  idea: null,
  blockedBy: [],
  pr,
  prAt: null
});

const cardOf = (c: Element, id: string): HTMLElement => {
  const found = Array.from(
    c.querySelectorAll<HTMLElement>('article.wcard')
  ).find((a) => a.querySelector('.wc-head .id')?.textContent === id);
  if (!found) throw new Error(`no card for ${id}`);
  return found;
};
const actionsOf = (card: Element): HTMLElement =>
  card.querySelector('.wc-actions') as HTMLElement;
const statusOf = (card: Element): HTMLElement =>
  card.querySelector('.wc-status') as HTMLElement;
const kids = (el: Element): HTMLElement[] =>
  Array.from(el.children) as HTMLElement[];
const notes = (el: Element): string[] =>
  Array.from(el.querySelectorAll('.wnote')).map((n) => n.textContent ?? '');
/** The buttons and link of an actions row, by what they are */
const order = (acts: Element): string[] =>
  kids(acts).map((el) =>
    el.tagName === 'A'
      ? 'link'
      : (['copilot', 'merge', 'label', 'snooze', 'wake'].find(
          (k) => k in el.dataset
        ) ?? 'other')
  );
const button = (c: Element, sel: string): HTMLButtonElement => {
  const b = c.querySelector<HTMLButtonElement>(sel);
  if (!b) throw new Error(`no button ${sel}`);
  return b;
};
const ids = (c: Element): string[] =>
  Array.from(c.querySelectorAll('article.wcard')).map(
    (a) => a.querySelector('.wc-head .id')?.textContent ?? ''
  );

/** The activity row that makes COD-4 a plan that has waited two hours */
const planReady = (s: DeskState): DeskState => {
  s.data.activity = {
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
  return s;
};

describe('BeforeSheet cards', () => {
  it('gives each thing that waits on you a card with its action', () => {
    const c = sheet(planReady(filled()));
    expect(c.querySelectorAll('article.wcard')).toHaveLength(4);
    expect(c.querySelectorAll('article.wcard.approved')).toHaveLength(0);
    const review = cardOf(c, 'COD-3').querySelector('a.act');
    expect(review?.className).toBe('act primary');
    expect(review?.textContent).toBe('Review on GitHub');
    expect(review?.getAttribute('href')).toContain('pull/7');
    expect(review?.getAttribute('rel')).toBe('noopener noreferrer');
    const handoffs = cardOf(c, 'COD-5').querySelector('a.act');
    expect(handoffs?.className).toBe('act primary');
    expect(handoffs?.textContent).toBe('Open checklist');
    const plan = cardOf(c, 'COD-4');
    expect(plan.querySelector('.kind.k-plan')?.textContent).toBe('plan');
    expect(plan.querySelector('time')?.textContent).toBe('waiting 2 h');
    expect(plan.querySelector('a.act')?.className).toBe('act primary');
    expect(plan.querySelector('a.act')?.textContent).toBe('Answer in Linear');
    const label = cardOf(c, 'COD-6');
    expect(label.querySelector('.kind.k-ready-to-label')?.textContent).toBe(
      'ready to label'
    );
    expect(label.querySelector('a.act')?.className).toBe('act secondary');
    expect(label.querySelector('a.act')?.textContent).toBe('Label agent:ready');
    expect(c.querySelector('.group h3')?.textContent).toBe(
      'Ideas to decide · 1'
    );
  });

  it('lists them furthest along first, ideas before approved plans', () => {
    const s = filled();
    s.data.runs = runs(
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
    const c = sheet(s);
    // The idea's own card comes between the label card and the approved plan
    expect(
      Array.from(c.querySelectorAll('article')).map((a) =>
        a.classList.contains('idea')
          ? 'idea'
          : (a.querySelector('.wc-head .id')?.textContent ?? '')
      )
    ).toEqual(['COD-3', 'COD-5', 'COD-8', 'COD-4', 'COD-6', 'idea', 'COD-9']);
  });

  it('shows an approved plan with its blockers and only an open link', () => {
    const s = filled();
    s.data.runs = runs(
      view({
        blocked: [{ ticket: 'COD-9', blockers: ['COD-2'] }],
        table: { before: [], label: [], after: [] }
      })
    );
    s.data.ideas = [];
    const c = sheet(s);
    const card = cardOf(c, 'COD-9');
    expect(card.className).toBe('wcard approved');
    const kind = card.querySelector('.kind');
    expect(kind?.textContent).toBe('approved · waits on COD-2');
    expect(kind?.querySelector('a.id')?.textContent).toBe('COD-2');
    const link = card.querySelector('a.act');
    expect(link?.className).toBe('act secondary');
    expect(link?.textContent).toBe('Open ticket');
    // The blockers are in the kind, so the note does not repeat them
    expect(card.querySelector('.wc-note')).toBeNull();
    expect(c.textContent).not.toContain('Waits on');
  });

  it('links the id in the head, and the blockers and review fixes in the note', () => {
    const s = filled();
    s.data.runs = runs(
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
    s.details.set('COD-3', { ...withPr(7), blockedBy: ['COD-2', 'COD-1'] });
    s.details.set('COD-2', withPr(5));
    s.details.set('COD-4', { ...withPr(null), blockedBy: ['COD-1'] });
    const c = sheet(s);
    const card = cardOf(c, 'COD-3');
    const head = card.querySelector('.wc-head');
    expect(head?.firstElementChild?.tagName).toBe('A');
    expect(head?.firstElementChild?.getAttribute('href')).toBe(
      'https://linear.app/codeware/issue/COD-3'
    );
    expect(head?.querySelector('a.prn')?.textContent).toBe('#7');
    const note = card.querySelector('.wc-note');
    expect(note?.textContent).toBe(
      'After COD-2 · PR 5, COD-1. Review fixes: waits on CI'
    );
    expect(
      Array.from(note?.querySelectorAll('a.id') ?? []).map((a) => a.textContent)
    ).toEqual(['COD-2', 'COD-1']);
    expect(cardOf(c, 'COD-4').querySelector('.wc-note')?.textContent).toBe(
      'After COD-1'
    );
  });

  it('shows a review card its PR state and age from a live github event', () => {
    const s = filled();
    s.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'pull_request_review:copilot',
        updated_at: new Date(NOW.getTime() - 2 * 6e4).toISOString()
      } as never
    ];
    const pr = cardOf(sheet(s), 'COD-3').querySelector('.wc-pr');
    expect(pr?.querySelector('.pill.wait')?.textContent).toBe(
      'Copilot reviewed — your turn'
    );
    expect(pr?.querySelector('time')?.textContent).toBe('2 m ago');
  });

  it('says queued, with no age, when a review card has no live event', () => {
    const pr = cardOf(sheet(filled()), 'COD-3').querySelector('.wc-pr');
    expect(pr?.children).toHaveLength(1);
    expect(pr?.querySelector('.pill.neutral')?.textContent).toBe('queued');
  });

  it('gives a card that is not a review no PR row', () => {
    const c = sheet(filled());
    expect(cardOf(c, 'COD-5').querySelector('.wc-pr')).toBeNull();
    expect(cardOf(c, 'COD-6').querySelector('.wc-pr')).toBeNull();
    expect(cardOf(c, 'COD-6').querySelector('.wc-status')).toBeNull();
  });

  it('says there is no queue view yet, and when nothing waits', () => {
    expect(sheet(createState()).textContent).toBe('No queue view yet.');
    const s = filled();
    s.data.ideas = [];
    s.data.runs = runs(view({ table: { before: [], label: [], after: [] } }));
    const c = sheet(s);
    expect(c.querySelector('.empty')?.textContent).toBe(
      'No PR, hand-off, plan, question, label or idea waits for you.'
    );
    expect(c.querySelector('article')).toBeNull();
  });
});

describe('BeforeSheet ideas', () => {
  it('says the ticket is loading until its details arrive', () => {
    const c = sheet(filled());
    const idea = c.querySelector('article.idea');
    expect(idea?.querySelector('a.title .id')?.textContent).toBe('COD-50');
    expect(idea?.querySelector('a.title')?.getAttribute('rel')).toBe(
      'noopener noreferrer'
    );
    expect(idea?.querySelector('.meta span')?.textContent).toMatch(
      /^suggested /
    );
    expect(idea?.textContent).toContain('Loading the ticket…');
    expect(idea?.textContent).toContain('Accept: set agent:ready');
  });

  it('shows the evidence and the rest of the idea, with code and ticket ids', () => {
    const s = filled();
    s.details.set('COD-50', {
      ...withPr(null),
      idea: {
        evidence: ['saw `COD-7` fail', 'twice in COD-8'],
        change: 'make it `faster`',
        cost: '',
        focus: 'dx',
        why: 'after COD-9'
      }
    });
    const idea = sheet(s).querySelector('article.idea') as HTMLElement;
    expect(
      Array.from(idea.querySelectorAll('h4')).map((h) => h.textContent)
    ).toEqual(['Evidence', 'What changes', 'Why now']);
    const items = idea.querySelectorAll('ul li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('code a.id')?.textContent).toBe('COD-7');
    expect(items[1].querySelector('a.id')?.textContent).toBe('COD-8');
    expect(idea.querySelector('p code')?.textContent).toBe('faster');
    expect(idea.querySelector('.meta')?.textContent).toContain('· dx');
    expect(idea.textContent).not.toContain('Loading the ticket');
  });

  it('says when the ticket does not follow the suggestion shape', () => {
    const s = filled();
    s.details.set('COD-50', withPr(null));
    const idea = sheet(s).querySelector('article.idea');
    expect(idea?.textContent).toContain(
      "The ticket doesn't follow the suggestion shape; read it in Linear."
    );
  });

  it('puts the Snooze button on the idea, and Wake in the fold once it is snoozed', () => {
    const s = on(snoozed());
    s.data.snoozes = [];
    const awake = sheet(s);
    expect(
      awake.querySelector('article.idea [data-snooze="COD-50"]')?.textContent
    ).toBe('Snooze');
    const folded = sheet(on(snoozed()));
    expect(folded.querySelector('article.idea')).toBeNull();
    expect(folded.textContent).not.toContain('Ideas to decide');
    expect(folded.querySelector('[data-wake="COD-50"]')).toBeNull();
  });

  it('wakes a snoozed idea from the fold when it is open', () => {
    const c = sheet(on(snoozed()), { open: true });
    expect(
      cardOf(c, 'COD-50').querySelector('[data-wake="COD-50"]')?.textContent
    ).toBe('Wake');
  });
});

describe('BeforeSheet snoozed fold', () => {
  it('folds the snoozed rows after the awake ones, only when there are some', () => {
    const c = sheet(snoozed(), { open: true });
    const fold = c.querySelector('.snoozed');
    const trigger = fold?.querySelector('button.snoozed-summary');
    expect(trigger?.getAttribute('type')).toBe('button');
    expect(trigger?.textContent).toBe('Snoozed · 2');
    expect(ids(fold as Element)).toEqual(['COD-3', 'COD-50']);
    // The idea is one of the two, as a wait card in the fold
    expect(fold?.querySelector('article.idea')).toBeNull();
    const awake = ids(c).filter((id) => !ids(fold as Element).includes(id));
    expect(awake).toEqual(['COD-5', 'COD-4', 'COD-6']);
    expect(
      c.querySelector('article.wcard')?.compareDocumentPosition(fold as Node)
    ).toBeTruthy();
    expect(sheet(filled()).querySelector('.snoozed')).toBeNull();
    expect(sheet(filled()).textContent).not.toContain('Snoozed');
  });

  it('keeps the fold closed unless it is open', () => {
    const closed = sheet(snoozed());
    expect(closed.querySelector('.snoozed')?.getAttribute('data-state')).toBe(
      'closed'
    );
    expect(closed.textContent).toContain('Snoozed · 2');
    expect(closed.textContent).not.toContain('COD-50');
    expect(
      closed.querySelector('.snoozed-summary')?.getAttribute('aria-expanded')
    ).toBe('false');
    const open = sheet(snoozed(), { open: true });
    expect(open.querySelector('.snoozed')?.getAttribute('data-state')).toBe(
      'open'
    );
    expect(open.textContent).toContain('COD-3');
  });

  it('asks to open and to close when the trigger is clicked', () => {
    const onOpen = vi.fn();
    fireEvent.click(
      button(sheet(snoozed(), { onOpenChange: onOpen }), '.snoozed-summary')
    );
    expect(onOpen).toHaveBeenCalledWith(true);
    const onClose = vi.fn();
    fireEvent.click(
      button(
        sheet(snoozed(), { open: true, onOpenChange: onClose }),
        '.snoozed-summary'
      )
    );
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('keeps the fold when every row is snoozed', () => {
    const s = filled();
    s.data.activity = { ...activity, rows: [] };
    s.data.ideas = [];
    s.data.runs = runs(
      view({
        table: {
          before: [{ ticket: 'COD-4', kind: 'plan' }],
          label: [],
          after: []
        }
      })
    );
    s.data.snoozes = [snooze('COD-4', 'plan')];
    const c = sheet(s);
    expect(c.querySelector('.empty')).toBeNull();
    expect(c.querySelector('.snoozed-summary')?.textContent).toBe(
      'Snoozed · 1'
    );
  });
});

describe('BeforeSheet snooze buttons', () => {
  it('draws Snooze and Wake in the cards when controls are on', () => {
    const c = sheet(on(snoozed()), { open: true });
    const snoozeBtn = button(c, '[data-snooze="COD-5"]');
    expect(snoozeBtn.className).toBe('wsnooze');
    expect(snoozeBtn.getAttribute('type')).toBe('button');
    expect(snoozeBtn.textContent).toBe('Snooze');
    expect(snoozeBtn.getAttribute('aria-label')).toBe(
      'Snooze COD-5 until it changes'
    );
    expect(snoozeBtn.disabled).toBe(false);
    const wake = button(c, '[data-wake="COD-3"]');
    expect(wake.className).toBe('wsnooze');
    expect(wake.textContent).toBe('Wake');
    expect(wake.getAttribute('aria-label')).toBe('Wake COD-3');
    expect(wake.closest('.snoozed')).not.toBeNull();
    expect(actionsOf(cardOf(c, 'COD-5')).contains(snoozeBtn)).toBe(true);
  });

  it('draws no buttons without controls, but still folds', () => {
    const c = sheet(snoozed());
    expect(c.querySelector('.wsnooze')).toBeNull();
    expect(c.querySelector('button:not(.snoozed-summary)')).toBeNull();
    expect(c.textContent).toContain('Snoozed · 2');
  });

  it('disables a button in flight and shows the note a refusal left', () => {
    const s = on(snoozed());
    s.controls.snoozing.add('COD-5');
    s.controls.snoozeNotes.set('COD-3', 'not <snoozed>');
    const c = sheet(s, { open: true });
    expect(button(c, '[data-snooze="COD-5"]').disabled).toBe(true);
    expect(button(c, '[data-wake="COD-3"]').disabled).toBe(false);
    expect(notes(c)).toEqual(['not <snoozed>']);
    expect(c.querySelector('snoozed')).toBeNull();
  });

  it('puts a snooze note in the status part, not in the actions row', () => {
    const s = on(snoozed());
    s.controls.snoozeNotes.set('COD-6', 'refused');
    const card = cardOf(sheet(s), 'COD-6');
    expect(notes(statusOf(card))).toEqual(['refused']);
    expect(notes(actionsOf(card))).toEqual([]);
  });
});

describe('BeforeSheet Label button', () => {
  const t = NOW.getTime();

  it('offers the button on a ready-to-label card only', () => {
    const c = sheet(on(snoozed()));
    expect(c.querySelectorAll('[data-label]')).toHaveLength(1);
    const label = button(cardOf(c, 'COD-6'), '[data-label="COD-6"]');
    expect(label.textContent).toBe('Label agent:ready');
    expect(label.className).toBe('act secondary');
    expect(label.disabled).toBe(false);
  });

  it('asks to confirm, then disables the button in flight', () => {
    const s = on(snoozed());
    s.controls.labelConfirm.set('COD-6', t - 1000);
    expect(button(sheet(s), '[data-label="COD-6"]').textContent).toBe(
      'Confirm label'
    );
    s.controls.labelling.add('COD-6');
    const busy = button(sheet(s), '[data-label="COD-6"]');
    expect(busy.textContent).toBe('labelling…');
    expect(busy.disabled).toBe(true);
  });

  it('replaces the button with a note once labelled', () => {
    const s = on(snoozed());
    s.controls.labelled.set('COD-6', t - 1000);
    const c = sheet(s);
    expect(c.querySelector('[data-label]')).toBeNull();
    expect(notes(statusOf(cardOf(c, 'COD-6')))).toEqual([
      'labelled · waiting for the queue'
    ]);
  });

  it('shows the note a failure left beside the button', () => {
    const s = on(snoozed());
    s.controls.labelNotes.set('COD-6', 'no <label>');
    const card = cardOf(sheet(s), 'COD-6');
    expect(card.querySelector('[data-label="COD-6"]')).not.toBeNull();
    expect(notes(statusOf(card))).toEqual(['no <label>']);
  });

  it('puts the button beside a link reading Open ticket, and keeps only the label link without controls', () => {
    const card = cardOf(sheet(on(snoozed())), 'COD-6');
    // The link stays: it is how the ticket is checked before confirming
    expect(card.querySelector('a.act')?.textContent).toBe('Open ticket');
    expect(order(actionsOf(card))).toEqual(['link', 'label', 'snooze']);
    const plain = cardOf(sheet(snoozed()), 'COD-6');
    expect(plain.querySelector('a.act')?.textContent).toBe('Label agent:ready');
    expect(plain.querySelector('[data-label]')).toBeNull();
  });
});

describe('BeforeSheet Copilot and Merge buttons', () => {
  const t = NOW.getTime();
  const ENTRY = {
    pr: 7,
    state: 'open',
    unresolved: 0,
    threads: 0,
    conflicting: false,
    ci: 'SUCCESS',
    copilot: 'none',
    at: NOW.toISOString()
  };
  // COD-3 is the review row with PR 7; `over` changes what the host's watch.json says of it
  const watched = (
    over: Record<string, unknown> = {},
    ticket = 'COD-3'
  ): DeskState => {
    const s = on(filled());
    s.data.runs = {
      ...runs(view()),
      watches: [
        {
          host: 'nuc',
          at: NOW.toISOString(),
          watch: { [ticket]: { ...ENTRY, ...over } }
        }
      ]
    };
    return s;
  };
  const card3 = (s: DeskState): HTMLElement => cardOf(sheet(s), 'COD-3');
  const sent = (
    id: number,
    kind: string,
    status: string,
    note: string | null = null,
    pr = 7
  ): DeskCommandRow => ({
    id,
    at: NOW.toISOString(),
    host: 'nuc',
    kind,
    args: { ticket: 'COD-3', pr },
    actor: 'desk',
    status,
    applied_at: status === 'pending' ? null : NOW.toISOString(),
    note
  });
  const copilot = (c: Element) =>
    c.querySelector<HTMLButtonElement>('[data-copilot]');
  const merge = (c: Element) =>
    c.querySelector<HTMLButtonElement>('[data-merge]');

  it('draws both buttons on a review card, after the link and before Snooze', () => {
    const card = card3(watched());
    const acts = actionsOf(card);
    expect(order(acts)).toEqual(['link', 'copilot', 'merge', 'snooze']);
    expect(copilot(acts)?.textContent).toBe('Copilot review');
    expect(copilot(acts)?.className).toBe('wsnooze');
    expect(merge(acts)?.textContent).toBe('Merge');
    expect(merge(acts)?.className).toBe('wsnooze');
    expect(merge(acts)?.getAttribute('title')).toBeNull();
    expect(acts.querySelector('[disabled]')).toBeNull();
  });

  it('stacks head, title, status and actions, with the PR before the notes', () => {
    const card = card3(watched({ ci: 'PENDING' }));
    expect(kids(card).map((el) => el.className)).toEqual([
      'wc-head',
      'wc-title',
      'wc-status',
      'wc-actions'
    ]);
    expect(kids(statusOf(card)).map((el) => el.className)).toEqual([
      'wc-pr',
      'wnote'
    ]);
    expect(notes(statusOf(card))).toEqual(['checks pending']);
    expect(notes(actionsOf(card))).toEqual([]);
  });

  it('draws nothing without controls, though the watch is there', () => {
    const s = watched();
    s.controls.target = null;
    const c = sheet(s);
    expect(c.querySelector('[data-copilot]')).toBeNull();
    expect(c.querySelector('[data-merge]')).toBeNull();
  });

  it('draws nothing on a card that is not a review, or whose PR the watch does not name', () => {
    // COD-5 waits on hand-offs, and COD-3's PR is 7, not 8
    for (const s of [
      watched({}, 'COD-5'),
      watched({ pr: 8 }),
      watched({}, 'COD-99')
    ]) {
      const c = sheet(s);
      expect(c.querySelector('[data-copilot]')).toBeNull();
      expect(c.querySelector('[data-merge]')).toBeNull();
    }
  });

  it('draws nothing once the PR is merged or closed', () => {
    for (const state of ['merged', 'closed']) {
      const c = sheet(watched({ state }));
      expect(c.querySelector('[data-copilot]')).toBeNull();
      expect(c.querySelector('[data-merge]')).toBeNull();
    }
  });

  it.each([
    ['in the merge queue', { state: 'queued' }, 'already in the merge queue'],
    ['conflicting', { state: 'conflicting' }, 'conflicts with main'],
    ['a conflict flag', { conflicting: true }, 'conflicts with main'],
    [
      'conflicts not checked',
      { conflicting: null },
      'GitHub has not checked for conflicts yet'
    ],
    [
      'mergeability unknown',
      { mergeable: 'UNKNOWN' },
      'GitHub has not checked for conflicts yet'
    ],
    ['a draft', { draft: true }, 'PR is a draft'],
    ['pending checks', { ci: 'PENDING' }, 'checks pending'],
    ['no check data', { ci: null }, 'no check data yet'],
    ['one thread', { threads: 1 }, '1 unresolved thread'],
    ['threads', { threads: 2 }, '2 unresolved threads']
  ])('disables Merge with the reason: %s', (_name, over, reason) => {
    const card = card3(watched(over));
    const b = merge(actionsOf(card));
    expect(b?.textContent).toBe('Merge');
    expect(b?.disabled).toBe(true);
    expect(b?.getAttribute('title')).toBe(reason);
    expect(notes(statusOf(card))).toEqual([reason]);
    expect(notes(actionsOf(card))).toEqual([]);
  });

  it('shows where Copilot stands instead of its button', () => {
    const asked = card3(watched({ copilot: 'requested' }));
    expect(copilot(asked)).toBeNull();
    expect(notes(statusOf(asked))).toEqual(['Copilot asked']);
    const reviewed = card3(watched({ copilot: 'reviewed' }));
    expect(copilot(reviewed)).toBeNull();
    expect(notes(statusOf(reviewed))).toEqual(['Copilot reviewed']);
  });

  it('offers no Copilot button when the watch does not say, but still Merge', () => {
    const card = card3(watched({ copilot: undefined }));
    expect(card.textContent).not.toContain('Copilot');
    expect(merge(card)?.textContent).toBe('Merge');
  });

  it('asks to confirm a merge for a few seconds', () => {
    const s = watched();
    s.controls.mergeConfirm.set('COD-3', t - 1000);
    expect(merge(card3(s))?.textContent).toBe('Confirm merge');
    s.controls.mergeConfirm.set('COD-3', t - 5000);
    expect(merge(card3(s))?.textContent).toBe('Merge');
  });

  it('does not ask to confirm a merge that is blocked', () => {
    const s = watched({ ci: 'PENDING' });
    s.controls.mergeConfirm.set('COD-3', t - 1000);
    expect(card3(s).textContent).not.toContain('Confirm merge');
  });

  it('disables each button while its command is pending or in flight', () => {
    const s = watched();
    s.data.deskCommands = [
      sent(1, 'merge', 'pending'),
      sent(2, 'copilot', 'pending')
    ];
    const pending = card3(s);
    expect(copilot(pending)?.textContent).toBe('Copilot…');
    expect(copilot(pending)?.disabled).toBe(true);
    expect(merge(pending)?.textContent).toBe('merging…');
    expect(merge(pending)?.disabled).toBe(true);
    const flying = watched();
    flying.controls.prSending.add('COD-3 7 merge');
    const inFlight = card3(flying);
    expect(merge(inFlight)?.textContent).toBe('merging…');
    expect(merge(inFlight)?.disabled).toBe(true);
    expect(copilot(inFlight)?.textContent).toBe('Copilot review');
    expect(copilot(inFlight)?.disabled).toBe(false);
  });

  it('ignores a command for an earlier PR of the ticket', () => {
    const s = watched();
    s.data.deskCommands = [
      sent(1, 'merge', 'applied', null, 6),
      sent(2, 'copilot', 'pending', null, 6),
      sent(3, 'merge', 'refused', 'old pr', 6)
    ];
    const card = card3(s);
    expect(merge(card)?.textContent).toBe('Merge');
    expect(copilot(card)?.textContent).toBe('Copilot review');
    expect(card.textContent).not.toContain('old pr');
  });

  it('says in the merge queue once applied, and Copilot asked until the watch catches up', () => {
    const s = watched();
    s.data.deskCommands = [
      sent(1, 'merge', 'applied'),
      sent(2, 'copilot', 'applied')
    ];
    const card = card3(s);
    expect(merge(card)).toBeNull();
    expect(copilot(card)).toBeNull();
    expect(notes(statusOf(card))).toEqual([
      'Copilot asked',
      'in the merge queue'
    ]);
  });

  it('renders the actual PR once a watch newer than the applied command arrives', () => {
    const later = new Date(t + 60_000).toISOString();
    // Removed from the merge queue, and Copilot never added: the buttons come back
    const s = watched({ at: later });
    s.data.deskCommands = [
      sent(1, 'merge', 'applied'),
      sent(2, 'copilot', 'applied')
    ];
    const card = card3(s);
    expect(merge(card)?.textContent).toBe('Merge');
    expect(copilot(card)?.textContent).toBe('Copilot review');
    expect(card.textContent).not.toContain('in the merge queue');
    expect(card.textContent).not.toContain('Copilot asked');
    const queued = watched({ at: later, state: 'queued' });
    queued.data.deskCommands = [sent(1, 'merge', 'applied')];
    expect(notes(statusOf(card3(queued)))).toContain(
      'already in the merge queue'
    );
  });

  it('shows a refusal in the status part above the buttons', () => {
    const s = watched();
    s.data.deskCommands = [
      sent(1, 'merge', 'refused', 'checks <pending>'),
      sent(2, 'copilot', 'refused', 'Copilot review already requested')
    ];
    const card = card3(s);
    expect(merge(card)?.textContent).toBe('Merge');
    expect(copilot(card)?.textContent).toBe('Copilot review');
    expect(notes(actionsOf(card))).toEqual([]);
    expect(notes(statusOf(card))).toEqual([
      'Copilot review already requested',
      'checks <pending>'
    ]);
  });

  it('shows the note a failed send left over a refusal', () => {
    const s = watched();
    s.data.deskCommands = [sent(1, 'merge', 'refused', 'old')];
    s.controls.prNotes.set('COD-3 7 merge', 'no <network>');
    s.controls.prNotes.set('COD-3 7 copilot', 'no <network>');
    expect(notes(statusOf(card3(s)))).toEqual(['no <network>', 'no <network>']);
  });
});

describe('BeforeSheet actions', () => {
  it('sends the row on a Snooze click, and the ticket on a Wake click', () => {
    const s = on(snoozed());
    s.data.activity = planReady(filled()).data.activity;
    s.data.snoozes = [snooze('COD-3', 'review')];
    const actions = fakeActions();
    const c = sheet(s, { open: true, actions });
    fireEvent.click(button(c, '[data-snooze="COD-4"]'));
    expect(actions.snooze).toHaveBeenCalledTimes(1);
    const row = actions.snooze.mock.calls[0][0];
    expect(row).toMatchObject({ id: 'COD-4', kind: 'plan' });
    expect(row.gateAt).toMatch(/T.*Z$/);
    fireEvent.click(button(c, '[data-wake="COD-3"]'));
    expect(actions.wake).toHaveBeenCalledWith('COD-3');
    expect(actions.snooze).toHaveBeenCalledTimes(1);
  });

  it('sends the idea row on its Snooze click', () => {
    const s = on(filled());
    const actions = fakeActions();
    fireEvent.click(
      button(sheet(s, { actions }), 'article.idea [data-snooze="COD-50"]')
    );
    expect(actions.snooze).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'COD-50', kind: 'idea' })
    );
  });

  it('sends the ticket on a Label click', () => {
    const actions = fakeActions();
    fireEvent.click(
      button(sheet(on(filled()), { actions }), '[data-label="COD-6"]')
    );
    expect(actions.label).toHaveBeenCalledWith('COD-6');
  });

  it('sends the ticket, kind, host and PR on a Copilot or Merge click', () => {
    const s = on(filled());
    s.data.runs = {
      ...runs(view()),
      watches: [
        {
          host: 'nuc',
          at: NOW.toISOString(),
          watch: {
            'COD-3': {
              pr: 7,
              state: 'open',
              unresolved: 0,
              threads: 0,
              conflicting: false,
              ci: 'SUCCESS',
              copilot: 'none',
              at: NOW.toISOString()
            }
          }
        }
      ]
    };
    const actions = fakeActions();
    const c = sheet(s, { actions });
    fireEvent.click(button(c, '[data-copilot="COD-3"]'));
    expect(actions.pr).toHaveBeenLastCalledWith('COD-3', 'copilot', 'nuc', 7);
    fireEvent.click(button(c, '[data-merge="COD-3"]'));
    expect(actions.pr).toHaveBeenLastCalledWith('COD-3', 'merge', 'nuc', 7);
    expect(actions.pr).toHaveBeenCalledTimes(2);
  });

  it('calls nothing for a disabled button', () => {
    const s = on(filled());
    s.controls.snoozing.add('COD-5');
    s.controls.labelling.add('COD-6');
    s.data.runs = {
      ...runs(view()),
      watches: [
        {
          host: 'nuc',
          at: NOW.toISOString(),
          watch: {
            'COD-3': {
              pr: 7,
              state: 'open',
              unresolved: 0,
              threads: 0,
              conflicting: false,
              ci: 'PENDING',
              copilot: 'none',
              at: NOW.toISOString()
            }
          }
        }
      ]
    };
    const actions = fakeActions();
    const c = sheet(s, { actions });
    for (const sel of [
      '[data-snooze="COD-5"]',
      '[data-label="COD-6"]',
      '[data-merge="COD-3"]'
    ]) {
      const b = button(c, sel);
      expect(b.disabled).toBe(true);
      fireEvent.click(b);
    }
    expect(actions.snooze).not.toHaveBeenCalled();
    expect(actions.label).not.toHaveBeenCalled();
    expect(actions.pr).not.toHaveBeenCalled();
  });
});

describe('BeforeSheet focus', () => {
  const focus = (el: HTMLElement) => act(() => el.focus());

  it('moves focus to the row’s Snooze when the focused Label button goes', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s));
    const label = button(r.container, '[data-label="COD-6"]');
    focus(label);
    expect(document.activeElement).toBe(label);
    s.controls.labelled.set('COD-6', NOW.getTime() - 1000);
    r.rerender(sheetEl(s));
    expect(r.container.querySelector('[data-label]')).toBeNull();
    expect(document.activeElement).toBe(
      button(r.container, '[data-snooze="COD-6"]')
    );
  });

  it('keeps focus on a button that is only re-rendered in place', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s));
    const label = button(r.container, '[data-label="COD-6"]');
    focus(label);
    s.controls.labelConfirm.set('COD-6', NOW.getTime() - 1000);
    r.rerender(sheetEl(s));
    expect(button(r.container, '[data-label="COD-6"]')).toBe(label);
    expect(label.textContent).toBe('Confirm label');
    expect(document.activeElement).toBe(label);
  });

  it('follows a row into the open fold, to its Wake button', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s, { open: true }));
    focus(button(r.container, '[data-snooze="COD-5"]'));
    s.data.snoozes = [...(s.data.snoozes ?? []), snooze('COD-5', 'hand-offs')];
    r.rerender(sheetEl(s, { open: true }));
    expect(document.activeElement).toBe(
      button(r.container, '[data-wake="COD-5"]')
    );
  });

  it('falls back to the fold’s trigger when the row goes into a closed fold', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s));
    focus(button(r.container, '[data-snooze="COD-5"]'));
    s.data.snoozes = [...(s.data.snoozes ?? []), snooze('COD-5', 'hand-offs')];
    r.rerender(sheetEl(s));
    expect(document.activeElement).toBe(
      button(r.container, '.snoozed-summary')
    );
  });

  it('follows a row out of the fold, to its Snooze button', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s, { open: true }));
    focus(button(r.container, '[data-wake="COD-3"]'));
    s.data.snoozes = (s.data.snoozes ?? []).filter((x) => x.ticket !== 'COD-3');
    r.rerender(sheetEl(s, { open: true }));
    expect(document.activeElement).toBe(
      button(r.container, '[data-snooze="COD-3"]')
    );
  });

  it('leaves focus alone when the viewer moved it elsewhere', () => {
    const s = on(snoozed());
    const r = render(sheetEl(s));
    focus(button(r.container, '[data-label="COD-6"]'));
    const other = document.createElement('button');
    document.body.append(other);
    focus(other);
    s.controls.labelled.set('COD-6', NOW.getTime() - 1000);
    r.rerender(sheetEl(s));
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
