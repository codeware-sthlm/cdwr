// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SnoozeRow } from '../../supabase';
import { model } from '../model';
import { type DeskState, createState } from '../state';
import { NOW, activity, filled, runs, view } from '../view/fixtures';

import { WaitingCard } from './waiting';

const card = (s: DeskState, open = false, onOpenChange = () => undefined) =>
  render(
    <WaitingCard
      m={model(s, NOW)}
      details={s.details}
      now={NOW}
      open={open}
      onOpenChange={onOpenChange}
    />
  ).container;

const withPr = (pr: number | null) => ({
  steps: 0,
  done: 0,
  next: null,
  idea: null,
  blockedBy: [],
  pr,
  prAt: null
});

/** A state whose waiting rows are the given plans */
const plans = (n: number): DeskState => {
  const s = filled();
  s.data.ideas = [];
  s.data.runs = runs(
    view({
      table: {
        before: Array.from({ length: n }, (_, i) => ({
          ticket: `COD-${10 + i}`,
          kind: 'plan' as const
        })),
        label: [],
        after: []
      }
    })
  );
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

const ids = (el: Element | null | undefined): string[] =>
  Array.from(el?.querySelectorAll('.wrow .id') ?? []).map(
    (x) => x.textContent ?? ''
  );

describe('WaitingCard', () => {
  it('shows a placeholder while loading', () => {
    const c = card(createState());
    expect(c.textContent).toContain('Loading…');
    expect(c.querySelector('b.count')?.textContent).toBe('–');
    expect(c.querySelector('article')?.className).toBe('card-top waiting');
  });

  it('lists what waits on the viewer, with its kind and age', () => {
    const s = filled();
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
    const c = card(s);
    const article = c.querySelector('article');
    expect(article?.className).toBe('card-top waiting has');
    expect(article?.getAttribute('data-w')).toBe('before');
    const head = c.querySelector('.ct-head button.open.state');
    expect(head?.textContent).toBe('Waiting on you');
    expect(head?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(c.querySelector('b.count')?.textContent).toBe('5');
    const kinds = Array.from(c.querySelectorAll('.wrow .kind')).map(
      (k) => k.textContent
    );
    expect(kinds).toContain('hand-offs · 1');
    const plan = Array.from(c.querySelectorAll('.wrow')).find((a) =>
      a.textContent?.includes('COD-4')
    );
    expect(plan?.querySelector('.kind')?.textContent).toBe('plan');
    expect(plan?.querySelector('time')?.textContent).toBe('2 h');
    expect(
      Array.from(c.querySelectorAll<HTMLAnchorElement>('a.wrow'))
        .find((a) => a.textContent?.includes('COD-6'))
        ?.getAttribute('href')
    ).toBe('https://linear.app/codeware/issue/COD-6');
    expect(c.querySelector('p.foot')?.textContent).toContain(
      'wait age from activity gate events'
    );
  });

  it('renders every row and hides all but two behind open all on a phone', () => {
    const s = filled();
    s.data.runs = runs(
      view({
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-<7>', kind: 'question' }
          ],
          label: [],
          after: []
        }
      })
    );
    const c = card(s);
    expect(c.querySelectorAll('a.wrow')).toHaveLength(3);
    const more = c.querySelector('button.more-all');
    expect(more?.className).toBe('more-all');
    expect(more?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(more?.textContent).toBe('+ 1 more — open all');
    expect(more?.querySelector('.more-n.phone')?.textContent).toBe('1');
    expect(more?.querySelector('.more-n.desk')).toBeNull();
    expect(c.textContent).toContain('COD-<7>');
  });

  it.each([
    [0, null],
    [2, null],
    [3, 'more-all'],
    [4, 'more-all'],
    [5, 'more-all more-desk'],
    [8, 'more-all more-desk']
  ])('with %i rows, shows the more button as %s', (n, cls) => {
    const c = card(plans(n));
    expect(c.querySelectorAll('a.wrow')).toHaveLength(n);
    const more = c.querySelector('button.more-all');
    if (cls === null) {
      expect(more).toBeNull();
      return;
    }
    expect(more?.className).toBe(cls);
    expect(more?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(more?.querySelector('.more-n.phone')?.textContent).toBe(
      String(n - 2)
    );
    expect(more?.querySelector('.more-n.desk')?.textContent ?? null).toBe(
      n > 4 ? String(n - 4) : null
    );
    // Inside the card, so a click opens the full Waiting on you sheet
    expect(c.querySelector('article')?.contains(more ?? null)).toBe(true);
  });

  it('stays in place, neutral, when nothing waits', () => {
    const s = filled();
    s.data.ideas = [];
    s.data.runs = runs(view({ table: { before: [], label: [], after: [] } }));
    const c = card(s);
    expect(c.querySelector('p.none')?.textContent).toBe(
      'Nothing waits on you.'
    );
    expect(c.querySelector('b.count')?.textContent).toBe('0');
    expect(c.querySelector('article')?.className).toBe('card-top waiting');
    expect(c.textContent).not.toContain('open all');
    expect(c.querySelector('p.foot')).toBeNull();
  });

  it('links the PR beside a plan and a question row, outside the row link', () => {
    const s = filled();
    s.data.runs = runs(
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
    s.details.set('COD-4', withPr(21));
    s.details.set('COD-8', withPr(22));
    const c = card(s);
    const prns = Array.from(c.querySelectorAll('a.prn'));
    expect(prns.map((a) => a.textContent)).toEqual(['#22', '#21']);
    for (const a of prns) {
      expect(a.parentElement?.tagName).toBe('LI');
      expect(a.closest('a.wrow')).toBeNull();
      expect(a.previousElementSibling?.className).toBe('wrow');
      expect(a.getAttribute('href')).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it('tints the PR number by its live state', () => {
    const s = filled();
    s.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'check_suite:success',
        updated_at: new Date('2026-10-29T11:56:00').toISOString()
      } as never
    ];
    expect(card(s).querySelector('a.prn')?.className).toBe('prn ok');
    expect(card(filled()).querySelector('a.prn')?.className).toBe('prn');
  });

  it('orders every kind furthest along first, approved plans last and uncounted', () => {
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
    const c = card(s);
    expect(ids(c)).toEqual([
      'COD-3',
      'COD-5',
      'COD-8',
      'COD-4',
      'COD-6',
      'COD-50',
      'COD-9'
    ]);
    expect(c.querySelector('b.count')?.textContent).toBe('6');
    const kinds = Array.from(c.querySelectorAll('.wrow .kind'));
    expect(kinds[1].textContent).toBe('hand-offs · 2');
    expect(kinds[1].getAttribute('title')).toBeNull();
    const approved = c.querySelector('li.wrow-li.approved');
    expect(approved?.querySelector('.id')?.textContent).toBe('COD-9');
    const kind = approved?.querySelector('.kind');
    expect(kind?.textContent).toBe('approved · waits on COD-2');
    expect(kind?.getAttribute('title')).toBe('approved · waits on COD-2');
    expect(c.querySelectorAll('li.wrow-li.approved')).toHaveLength(1);
    const more = c.querySelector('button.more-all');
    expect(more?.className).toBe('more-all more-desk');
    expect(more?.querySelector('.more-n.phone')?.textContent).toBe('5');
    expect(more?.querySelector('.more-n.desk')?.textContent).toBe('3');
  });

  it('keeps a parked PR listed with its PR number, and leaves notes to the panel', () => {
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
    const c = card(s);
    expect(
      Array.from(c.querySelectorAll('a.prn')).map((a) => a.textContent)
    ).toContain('#7');
    expect(c.querySelector('.wnote')).toBeNull();
    expect(c.textContent).not.toContain('Review fixes');
    expect(c.textContent).not.toContain('After');
  });

  it('keeps each row to id, title, kind, age and the PR link, with no buttons', () => {
    const s = filled();
    s.data.snoozes = [];
    s.data.runs = runs(
      view({
        parked: [{ ticket: 'COD-3', wait: 'ci', pr: 7 }],
        table: {
          before: [],
          label: [{ ticket: 'COD-6', parent: 'COD-<1>', blockers: [] }],
          after: [{ ticket: 'COD-3', kind: 'pr', pr: 7 }]
        }
      })
    );
    s.details.set('COD-3', { ...withPr(7), blockedBy: ['COD-2'] });
    const c = card(s);
    expect(c.querySelector('button.wsnooze')).toBeNull();
    expect(
      c.querySelector('[data-label],[data-snooze],[data-wake]')
    ).toBeNull();
    expect(c.querySelector('[data-copilot],[data-merge]')).toBeNull();
    expect(c.querySelector('li.wrow-li > button')).toBeNull();
    const li = Array.from(c.querySelectorAll('li.wrow-li')).find(
      (x) => x.querySelector('.id')?.textContent === 'COD-3'
    );
    const link = li?.querySelector('a.wrow');
    expect(link?.querySelector('.t')?.textContent).toBe('Title of COD-3');
    expect(link?.querySelector('.kind')?.textContent).toBe('review');
    expect(li?.querySelector('a.prn')?.textContent).toBe('#7');
  });

  describe('snoozed rows', () => {
    it('leaves them out of the badge and the awake list', () => {
      const c = card(snoozed());
      expect(c.querySelector('b.count')?.textContent).toBe('3');
      expect(ids(c.querySelector('ul.wrows'))).toEqual([
        'COD-5',
        'COD-4',
        'COD-6'
      ]);
    });

    it('folds them after the awake ones, only when there are some', () => {
      const c = card(snoozed(), true);
      const fold = c.querySelector('.snoozed');
      const trigger = fold?.querySelector('button.snoozed-summary');
      expect(trigger?.getAttribute('type')).toBe('button');
      expect(trigger?.textContent).toBe('Snoozed · 2');
      expect(ids(fold)).toEqual(['COD-3', 'COD-50']);
      const awake = c.querySelector('ul.wrows');
      expect(fold?.contains(awake ?? null)).toBe(false);
      expect(
        awake?.compareDocumentPosition(fold as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(card(filled()).querySelector('.snoozed')).toBeNull();
    });

    it('keeps the fold closed unless it is open, and opens with its rows', () => {
      const closed = card(snoozed());
      expect(closed.querySelector('.snoozed')?.getAttribute('data-state')).toBe(
        'closed'
      );
      expect(closed.textContent).toContain('Snoozed · 2');
      expect(closed.textContent).not.toContain('COD-50');
      expect(
        closed.querySelector('.snoozed-summary')?.getAttribute('aria-expanded')
      ).toBe('false');
      const open = card(snoozed(), true);
      expect(open.querySelector('.snoozed')?.getAttribute('data-state')).toBe(
        'open'
      );
      expect(open.textContent).toContain('COD-50');
    });

    it('asks to open when the trigger is clicked', () => {
      const onOpenChange = vi.fn();
      const c = card(snoozed(), false, onOpenChange);
      fireEvent.click(c.querySelector('.snoozed-summary') as Element);
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('asks to close when the open trigger is clicked', () => {
      const onOpenChange = vi.fn();
      const c = card(snoozed(), true, onOpenChange);
      fireEvent.click(c.querySelector('.snoozed-summary') as Element);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('says nothing waits when every row is snoozed, and keeps the fold', () => {
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
      const c = card(s);
      expect(c.querySelector('p.none')?.textContent).toBe(
        'Nothing waits on you.'
      );
      expect(c.querySelector('.snoozed-summary')?.textContent).toBe(
        'Snoozed · 1'
      );
      expect(c.querySelector('b.count')?.textContent).toBe('0');
      expect(c.querySelector('p.foot')).toBeNull();
    });

    it('draws no buttons on the rows, snoozed or not', () => {
      const s = snoozed();
      s.controls.target = {
        supabaseUrl: 'https://x.supabase.co',
        controlToken: 't'
      };
      const c = card(s, true);
      expect(c.textContent).toContain('Snoozed · 2');
      expect(c.querySelector('li.wrow-li > button')).toBeNull();
      expect(c.querySelector('.wsnooze')).toBeNull();
      expect(c.querySelector('[data-snooze],[data-wake]')).toBeNull();
    });
  });
});
