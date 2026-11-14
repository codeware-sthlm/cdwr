// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { NO_TREE_FILTER, createState } from '../state';
import type { QueueTreeNode } from '../types';
import { NOW, reviewRecord, runs, view } from '../view/fixtures';
import { findingsByTicket } from '../view/review';

import { FindingsPart, ReviewPanel } from './review';
import { TreePage } from './tree';

const text = (el: Element | null): string => el?.textContent ?? '';

const panel = (over: Partial<Parameters<typeof ReviewPanel>[0]> = {}) => {
  const onReview = vi.fn();
  const c = render(
    <ReviewPanel
      review={reviewRecord()}
      now={NOW}
      can
      busy={false}
      note={null}
      onReview={onReview}
      onTicket={vi.fn()}
      {...over}
    />
  ).container;
  return { c, onReview };
};

describe('ReviewPanel', () => {
  it('shows the brief, the numbered actions, stale tickets and suggestions', () => {
    const { c } = panel();
    const t = text(c);
    expect(t).toContain('Two PRs wait on you');
    expect(t).toContain('Merge the PR');
    expect(t).toContain('Checks passed');
    expect(c.querySelectorAll('ol > li')).toHaveLength(1);
    expect(t).toContain('Untouched for 30 days');
    expect(t).toContain('A quick win');
  });

  it('links an action to its ticket', () => {
    const { c } = panel();
    expect(c.querySelector('ol a')?.getAttribute('href')).toContain('COD-1');
  });

  it('says when it ran and what it cost', () => {
    expect(text(panel().c)).toContain('reviewed 30 min ago · $0.42 · sonnet');
  });

  it('sends a review from its button', () => {
    const { c, onReview } = panel();
    const button = c.querySelector<HTMLButtonElement>('[data-review-now]');
    expect(text(button)).toBe('Review now');
    fireEvent.click(button as HTMLElement);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('has no button without a control token', () => {
    expect(
      panel({ can: false }).c.querySelector('[data-review-now]')
    ).toBeNull();
  });

  it('disables the button while a request is in flight and shows a refusal', () => {
    const { c } = panel({ busy: true, note: 'no scheduler reports from nuc' });
    expect(
      c.querySelector<HTMLButtonElement>('[data-review-now]')?.disabled
    ).toBe(true);
    expect(text(c)).toContain('no scheduler reports from nuc');
  });

  it('reads one line and the button when there is no review yet', () => {
    const { c } = panel({ review: null });
    expect(text(c)).toContain('No review yet.');
    expect(c.querySelector('[data-review-now]')).not.toBeNull();
  });

  it('leaves the button out of the empty line without a token', () => {
    const { c } = panel({ review: null, can: false });
    expect(text(c)).toContain('No review yet.');
    expect(c.querySelector('button')).toBeNull();
  });
});

describe('FindingsPart', () => {
  const [blocks] = reviewRecord().findings;
  const part = (can = true) => {
    const onDismiss = vi.fn();
    const c = render(
      <FindingsPart
        findings={[blocks]}
        can={can}
        dismissing={new Set()}
        notes={new Map()}
        onDismiss={onDismiss}
      />
    ).container;
    return { c, onDismiss };
  };

  it('shows the kind, the fix and the evidence', () => {
    const t = text(part().c);
    expect(t).toContain('AI · stale PR');
    expect(t).toContain('Rebase it');
    expect(t).toContain('no push in 9 days');
  });

  it('dismisses with the finding id and the note', () => {
    const { c, onDismiss } = part();
    fireEvent.change(c.querySelector('input') as HTMLElement, {
      target: { value: 'not a problem' }
    });
    fireEvent.click(c.querySelector('[data-dismiss]') as HTMLElement);
    expect(onDismiss).toHaveBeenCalledWith(
      'stale-pr:COD-2:0a1b2c3d',
      'not a problem'
    );
  });

  it('dismisses without a note', () => {
    const { c, onDismiss } = part();
    fireEvent.click(c.querySelector('[data-dismiss]') as HTMLElement);
    expect(onDismiss).toHaveBeenCalledWith('stale-pr:COD-2:0a1b2c3d', '');
  });

  it('caps the note at 200 characters', () => {
    expect(part().c.querySelector('input')?.maxLength).toBe(200);
  });

  it('has no dismiss without a control token', () => {
    expect(part(false).c.querySelector('button')).toBeNull();
  });

  it('shows nothing without findings', () => {
    const c = render(
      <FindingsPart
        findings={[]}
        can
        dismissing={new Set()}
        notes={new Map()}
        onDismiss={vi.fn()}
      />
    ).container;
    expect(c.innerHTML).toBe('');
  });
});

describe('AI chips on the tree', () => {
  const node = (ticket: string): QueueTreeNode => ({
    ticket,
    title: `Tree ${ticket}`,
    state: 'started',
    label: null,
    pr: null,
    position: null,
    waiting: false,
    blockers: [],
    gaps: [],
    children: []
  });

  const tree = (dismissed: string[]) => {
    const state = createState();
    state.data.runs = runs(view({ tree: [node('COD-2'), node('COD-3')] }));
    return render(
      <TreePage
        m={model(state, NOW)}
        details={state.details}
        now={NOW}
        filter={{ ...NO_TREE_FILTER, closed: true }}
        onFilter={vi.fn()}
        open={{}}
        onOpen={vi.fn()}
        onDesk={vi.fn()}
        onTicket={vi.fn()}
        findings={findingsByTicket(
          reviewRecord(),
          dismissed.map((finding_id) => ({
            finding_id,
            at: NOW.toISOString(),
            actor: 'desk',
            note: null
          }))
        )}
      />
    ).container;
  };

  it('puts a chip on the row of its ticket, coloured by severity', () => {
    const c = tree([]);
    expect(text(c.querySelector('.chip.ai-blocks'))).toBe('AI · stale PR');
    expect(c.querySelector('.chip.ai-blocks')?.className).toContain(
      'var(--wait)'
    );
    expect(text(c.querySelector('.chip.ai-note'))).toBe('AI · thin plan');
    expect(c.querySelector('.chip.ai-note')?.className).toContain(
      'var(--muted)'
    );
  });

  it('leaves a dismissed finding off its row', () => {
    const c = tree(['stale-pr:COD-2:0a1b2c3d']);
    expect(c.querySelector('.chip.ai-blocks')).toBeNull();
    expect(c.querySelector('.chip.ai-note')).not.toBeNull();
  });
});
