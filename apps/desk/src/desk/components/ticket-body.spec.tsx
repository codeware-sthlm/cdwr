// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import type { ApplyItem } from '../parsers';
import { type DeskState, createState } from '../state';
import { NOW, issue, runs, ticketDesk, view } from '../view/fixtures';
import { ACTIVITY_MAX } from '../view/ticket';

import type { SheetActions } from './sheets';
import { TicketBody } from './ticket-body';

const actions: SheetActions = {
  wait: {
    snooze: vi.fn(),
    wake: vi.fn(),
    label: vi.fn(),
    pr: vi.fn(),
    copy: vi.fn(),
    showInTree: vi.fn()
  },
  onTicket: vi.fn(),
  onDismiss: vi.fn(),
  onDrop: vi.fn(),
  onSnoozedOpen: vi.fn(),
  onActFilter: vi.fn(),
  onFilter: vi.fn(),
  onNoticeFilter: vi.fn()
};

/** The body for a ticket of the state */
const body = (state: DeskState, ticket: string | null): HTMLElement => {
  state.ui.ticket = ticket;
  return render(
    <TicketBody
      m={model(state, NOW, null)}
      state={state}
      now={NOW}
      actions={actions}
    />
  ).container;
};

const text = (el: Element | null): string => el?.textContent ?? '';

const headings = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('h3')].map(text);

describe('TicketBody', () => {
  it('shows each part the desk holds, in order', () => {
    expect(headings(body(ticketDesk(), 'COD-3'))).toEqual([
      'Linear',
      'Queue',
      'Tree',
      'PR',
      'Gaps',
      'Session',
      'Plan',
      'Snooze',
      'Spend',
      'Activity'
    ]);
  });

  it('lists the apply list with each item in its state', () => {
    const s = ticketDesk();
    const item = (text: string, over: Partial<ApplyItem> = {}): ApplyItem => {
      const spec = text.split(' · ')[0];
      const tokens = spec.split(' ');
      return {
        text,
        spec,
        kind: tokens[0],
        args: tokens.slice(1),
        afterDeploy: false,
        checked: false,
        dropped: false,
        outcome: null,
        ...over
      };
    };
    s.liveApply.set('COD-5', [
      item('restart cdwr-cms', { checked: true, outcome: 'applied 07:12Z' }),
      item('agent-deploy', { dropped: true }),
      item('scale cdwr-cms 2', {
        outcome: 'refused: no DESK_FLY_TOKEN on nuc'
      }),
      item('deploy-workflow cms production', { afterDeploy: true }),
      item('supabase-migration a.sql')
    ]);
    const c = body(s, 'COD-5');
    const rows = [...c.querySelectorAll('li')].map(text);
    expect(rows).toContain('restart cdwr-cmsappliedapplied 07:12Z');
    expect(rows).toContain('agent-deploydropped');
    expect(
      rows.some((r) =>
        r.startsWith('scale cdwr-cms 2refusedno DESK_FLY_TOKEN on nuc')
      )
    ).toBe(true);
    expect(rows).toContain('deploy-workflow cms productionwaiting for deploy');
    expect(rows).toContain('supabase-migration a.sqlpending');
  });

  describe('Drop on the apply list', () => {
    const apply = (text: string, over: Partial<ApplyItem> = {}): ApplyItem => {
      const spec = text.split(' · ')[0];
      const tokens = spec.split(' ');
      return {
        text,
        spec,
        kind: tokens[0],
        args: tokens.slice(1),
        afterDeploy: false,
        checked: false,
        dropped: false,
        outcome: null,
        ...over
      };
    };
    const REFUSED = 'agent-deploy · refused: no self-deploy within 3 hours';

    /** COD-5 with its apply list, Done or not, the controls on and a deploy on the host */
    const desk = (done: boolean, deployAt = '2026-10-29T08:00:00') => {
      const s = ticketDesk();
      s.controls.target = {
        supabaseUrl: 'https://x.supabase.co',
        controlToken: 't'
      };
      s.data.closed = [
        ...(s.data.closed ?? []),
        issue('COD-5', {
          status: done ? 'Done' : 'In Review',
          statusType: done ? 'completed' : 'started',
          completedAt: done ? '2026-10-28T10:00:00' : null
        })
      ];
      s.data.runs = {
        ...(s.data.runs as NonNullable<typeof s.data.runs>),
        deploys: [
          {
            host: 'nuc',
            at: deployAt,
            deploy: {
              tag: 'sha-abc1234',
              previous: null,
              at: deployAt,
              by: 'self',
              phase: 'ok',
              reason: null,
              failed: null
            }
          }
        ]
      };
      s.liveApply.set('COD-5', [
        apply(REFUSED, {
          outcome: 'refused: no self-deploy within 3 hours'
        }),
        apply('restart cdwr-cms'),
        apply('restart cdwr-web', { checked: true }),
        apply('restart cdwr-old', { dropped: true })
      ]);
      return s;
    };

    const drops = (c: HTMLElement) => [
      ...c.querySelectorAll<HTMLElement>('[data-drop]')
    ];

    it('sends the item text and the reason to the host, once per open item', () => {
      const c = body(desk(true), 'COD-5');
      expect(drops(c)).toHaveLength(2);
      const reason = c.querySelector(
        `[aria-label="Reason for dropping ${REFUSED}"]`
      ) as HTMLElement;
      fireEvent.change(reason, { target: { value: ' done by hand ' } });
      fireEvent.click(
        c.querySelector(`[aria-label="Drop ${REFUSED}"]`) as HTMLElement
      );
      expect(actions.onDrop).toHaveBeenCalledWith(
        'COD-5',
        REFUSED,
        ' done by hand '
      );
    });

    it('is absent on a ticket that is not Done', () => {
      expect(drops(body(desk(false), 'COD-5'))).toHaveLength(0);
    });

    it('is absent without the controls', () => {
      const s = desk(true);
      s.controls.target = null;
      expect(drops(body(s, 'COD-5'))).toHaveLength(0);
    });

    it('shows a refused item with its reason, the by-hand command and no retry', () => {
      const t = text(body(desk(true), 'COD-5'));
      expect(t).toContain(
        'Refused items are never retried: drop it, or do it by hand: cdwr agent deploy --host agent-host'
      );
      expect(t).not.toContain('retry:');
      expect(t).toContain('no self-deploy within 3 hours');
    });

    it('names a healthy deploy since the merge, and none before it', () => {
      const newer = text(body(desk(true), 'COD-5'));
      expect(newer).toContain('deployed since: sha-abc1234 at');
      expect(newer).toContain('safe to drop');
      const older = text(body(desk(true, '2026-10-27T08:00:00'), 'COD-5'));
      expect(older).not.toContain('deployed since');
    });

    it('shows a pending Drop and a refused one with its note', () => {
      const s = desk(true);
      const key = `COD-5 ${REFUSED}`;
      s.controls.dropSending.add(key);
      let c = body(s, 'COD-5');
      expect(
        c.querySelector<HTMLButtonElement>(`[aria-label="Drop ${REFUSED}"]`)
          ?.disabled
      ).toBe(true);
      s.controls.dropSending.clear();
      s.controls.dropNotes.set(key, 'no open line reads that');
      c = body(s, 'COD-5');
      expect(text(c)).toContain('no open line reads that');
    });
  });

  it('lists the candidates to check after the gaps', () => {
    const s = ticketDesk();
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
    const c = body(s, 'COD-50');
    expect(headings(c)).toContain('Gaps');
    expect(headings(c)).toContain('Candidates to check');
    expect(text(c)).toContain('COD-50 has not moved. Check it.');
  });

  it('fills the parts from what the desk holds', () => {
    const c = body(ticketDesk(), 'COD-3');
    const t = text(c);
    // Linear
    expect(t).toContain('Todo');
    expect(text(c.querySelector('.chip.review'))).toBe('review');
    expect(t).toContain('Medium');
    expect(t).toContain('28 days ago');
    expect(
      c.querySelector('a.id[href="https://linear.app/codeware/issue/COD-3"]')
    ).not.toBeNull();
    // Queue
    expect(t).toContain('Waits on you');
    expect(t).toContain("Holds one of the limit's slots");
    // PR
    expect(c.querySelector('a.prn[href$="/pull/7"]')).not.toBeNull();
    expect(t).toContain('success');
    expect(t).toContain('1 unresolved thread');
    // Gaps, session, plan, snooze, spend
    expect(t).toContain('PR is stale. rebase it.');
    expect(t).toContain('nuc · implement');
    expect(t).toContain('2/4 done');
    expect(t).toContain('on review');
    expect(t).toContain('$6.00');
    expect(c.querySelectorAll('time')).toHaveLength(ACTIVITY_MAX);
  });

  it('opens the Ticket sheet for the parent and the siblings, and keeps their Linear links', () => {
    const c = body(ticketDesk(), 'COD-3');
    // The row's title is a button; the id beside it is the Linear link
    const buttons = [...c.querySelectorAll('button')];
    expect(buttons.map(text)).toEqual(['The root', 'The sibling']);
    fireEvent.click(buttons[1]);
    expect(actions.onTicket).toHaveBeenCalledWith('COD-11');
    expect(c.querySelector('a.id[href$="/issue/COD-10"]')?.textContent).toBe(
      'COD-10'
    );
  });

  it('leaves out the parts the desk holds nothing for', () => {
    // COD-50 is an idea: Linear knows it, nothing else does
    expect(headings(body(ticketDesk(), 'COD-50'))).toEqual(['Linear']);
  });

  it('says the desk holds nothing more for an unknown ticket, with its Linear link', () => {
    const c = body(ticketDesk(), 'COD-999');
    expect(headings(c)).toEqual([]);
    expect(text(c)).toContain('The desk holds nothing more for this ticket.');
    expect(
      c.querySelector('a.id[href="https://linear.app/codeware/issue/COD-999"]')
    ).not.toBeNull();
  });

  it('renders without a ticket chosen', () => {
    for (const state of [createState(), ticketDesk()]) {
      const c = body(state, null);
      expect(text(c)).toContain('No ticket chosen.');
      expect(c.innerHTML).not.toContain('undefined');
    }
  });
});
