import { describe, expect, it } from 'vitest';

import { type Live, type LiveIssue, reconcileView } from './reconcile';
import type { QueueView } from './types';

const AT = '2026-10-29T17:09:00Z';
const BEFORE = '2026-10-29T17:00:00Z';
const AFTER = '2026-10-29T17:11:00Z';

const view = (over: Partial<QueueView> = {}): QueueView => ({
  at: AT,
  limit: { used: 2, max: 5 },
  session: { state: 'none' },
  next: [],
  held: { tickets: [], free: [] },
  parked: [],
  table: { before: [], label: [], after: [] },
  ...over
});

const live = (
  issues: Record<string, Partial<LiveIssue>>,
  next: Record<string, string | null> = {}
): Live => ({
  issue: (id) =>
    issues[id]
      ? {
          labels: [],
          statusType: 'started',
          updatedAt: AFTER,
          ...issues[id]
        }
      : undefined,
  nextLine: (id) => (id in next ? next[id] : undefined)
});

const parkedView = view({
  parked: [{ ticket: 'COD-1', wait: 'ci', pr: 713, since: AT }]
});

const tickets = (v: QueueView) => ({
  next: v.next.map((x) => x.ticket),
  parked: v.parked.map((x) => x.ticket),
  held: v.held.tickets,
  after: v.table.after.map((x) => x.ticket)
});

describe('reconcileView', () => {
  describe('parked', () => {
    it('hides an entry whose live Next line moved on from its wait', () => {
      const v = reconcileView(
        parkedView,
        live(
          { 'COD-1': { labels: ['agent:review'] } },
          { 'COD-1': "waiting for Håkan's review of PR 713" }
        )
      );
      expect(v.parked).toEqual([]);
    });

    it('hides an entry whose agent label is gone', () => {
      const v = reconcileView(parkedView, live({ 'COD-1': { labels: [] } }));
      expect(v.parked).toEqual([]);
    });

    it('hides an entry whose ticket closed', () => {
      const v = reconcileView(
        parkedView,
        live({
          'COD-1': { labels: ['agent:review'], statusType: 'completed' }
        })
      );
      expect(v.parked).toEqual([]);
    });

    it('keeps an entry still waiting, its code span and all', () => {
      const v = reconcileView(
        parkedView,
        live(
          { 'COD-1': { labels: ['agent:working'] } },
          {
            'COD-1':
              '`Waiting: CI · PR 713 @ 1a2b3c4 · since 2026-10-29T17:05Z`'
          }
        )
      );
      expect(tickets(v).parked).toEqual(['COD-1']);
    });

    it('keeps an entry whose details have not loaded or carry no Next line', () => {
      const issues = { 'COD-1': { labels: ['agent:working'] } };
      expect(tickets(reconcileView(parkedView, live(issues))).parked).toEqual([
        'COD-1'
      ]);
      expect(
        tickets(reconcileView(parkedView, live(issues, { 'COD-1': null })))
          .parked
      ).toEqual(['COD-1']);
    });
  });

  describe('next', () => {
    const entries = view({
      next: [
        { ticket: 'COD-1', reason: 'resume' },
        { ticket: 'COD-2', reason: 'take over' },
        { ticket: 'COD-3', reason: 'parked wait resolved' },
        { ticket: 'COD-4', reason: 'answered' },
        { ticket: 'COD-5', reason: 'review feedback' },
        { ticket: 'COD-6', reason: 'ready' }
      ]
    });

    it('hides each entry whose live label no longer fits its reason', () => {
      const v = reconcileView(
        entries,
        live(
          {
            'COD-1': { labels: ['agent:review'] },
            'COD-2': { labels: ['agent:needs-input'] },
            'COD-3': { labels: ['agent:working'] },
            'COD-4': { labels: ['agent:working'] },
            'COD-5': { labels: ['agent:review'], statusType: 'completed' },
            'COD-6': { labels: ['agent:working'] }
          },
          { 'COD-3': 'step 4, the render' }
        )
      );
      expect(v.next).toEqual([]);
    });

    it('keeps each entry the live change does not contradict', () => {
      const v = reconcileView(
        entries,
        live(
          {
            'COD-1': { labels: ['agent:working'] },
            'COD-2': { labels: ['agent:working'] },
            'COD-3': { labels: ['agent:review'] },
            'COD-4': { labels: ['agent:needs-input'] },
            'COD-5': { labels: ['agent:review'] },
            'COD-6': { labels: ['agent:ready'], statusType: 'backlog' }
          },
          { 'COD-3': '`Waiting: CI · PR 9 @ abc · since 2026-10-29T17:00Z`' }
        )
      );
      expect(tickets(v).next).toEqual([
        'COD-1',
        'COD-2',
        'COD-3',
        'COD-4',
        'COD-5',
        'COD-6'
      ]);
    });

    it('keeps an entry with a reason it does not know', () => {
      const v = reconcileView(
        view({ next: [{ ticket: 'COD-1', reason: 'something new' }] }),
        live({ 'COD-1': { labels: [] } })
      );
      expect(tickets(v).next).toEqual(['COD-1']);
    });
  });

  describe('held', () => {
    const held = view({ held: { tickets: ['COD-1', 'COD-2'], free: [] } });

    it('hides a held ticket that is no longer agent:ready', () => {
      const v = reconcileView(
        held,
        live({
          'COD-1': { labels: ['agent:working'] },
          'COD-2': { labels: ['agent:ready'] }
        })
      );
      expect(v.held.tickets).toEqual(['COD-2']);
    });
  });

  describe('open PRs', () => {
    const after = view({
      table: {
        before: [],
        label: [],
        after: [
          { ticket: 'COD-1', kind: 'pr', pr: 1 },
          { ticket: 'COD-2', kind: 'pr', pr: 2 },
          { ticket: 'COD-3', kind: 'handoffs', items: ['run it'] }
        ]
      }
    });

    it('hides a PR whose ticket merged, keeps the rest and every hand-off', () => {
      const v = reconcileView(
        after,
        live({
          'COD-1': { labels: ['agent:review'], statusType: 'completed' },
          'COD-2': { labels: ['agent:review'] },
          'COD-3': { labels: ['agent:review'], statusType: 'completed' }
        })
      );
      expect(tickets(v).after).toEqual(['COD-2', 'COD-3']);
    });
  });

  describe('what never contradicts', () => {
    it('keeps an entry whose live issue is no newer than the view', () => {
      const v = reconcileView(
        parkedView,
        live({ 'COD-1': { labels: [], updatedAt: BEFORE } })
      );
      expect(tickets(v).parked).toEqual(['COD-1']);
    });

    it('keeps an entry whose live issue changed at the same time as the view', () => {
      const v = reconcileView(
        parkedView,
        live({ 'COD-1': { labels: [], updatedAt: AT } })
      );
      expect(tickets(v).parked).toEqual(['COD-1']);
    });

    it('keeps an entry for a ticket no live list holds', () => {
      const v = reconcileView(parkedView, live({}));
      expect(tickets(v).parked).toEqual(['COD-1']);
    });

    it('leaves a view without a time as it is', () => {
      const v = view({ at: undefined, parked: parkedView.parked });
      expect(reconcileView(v, live({ 'COD-1': { labels: [] } }))).toBe(v);
    });
  });
});
