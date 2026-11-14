// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { type DeskState, createState } from '../state';
import { NOW, runs, ticketDesk, view } from '../view/fixtures';
import { ACTIVITY_MAX } from '../view/ticket';

import type { SheetActions } from './sheets';
import { TicketBody } from './ticket-body';

const actions: SheetActions = {
  wait: { snooze: vi.fn(), wake: vi.fn(), label: vi.fn(), pr: vi.fn() },
  onTicket: vi.fn(),
  onSnoozedOpen: vi.fn(),
  onActFilter: vi.fn(),
  onFilter: vi.fn()
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
