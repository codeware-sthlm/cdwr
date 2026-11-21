import { describe, expect, it } from 'vitest';

import { NO_TREE_FILTER, type TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';

import { filterTree, hasGap, hasPosition, worstChild } from './tree';

const node = (
  ticket: string,
  state: string,
  over: Partial<QueueTreeNode> = {}
): QueueTreeNode => ({
  ticket,
  title: null,
  state,
  label: null,
  pr: null,
  position: null,
  waiting: false,
  blockers: [],
  gaps: [],
  children: [],
  ...over
});

const real = (kind: string) => ({ kind, candidate: false });
const cand = (kind: string) => ({ kind, candidate: true });

const TREE: QueueTreeNode[] = [
  node('A', 'completed', {
    children: [node('A1', 'completed'), node('A2', 'canceled')]
  }),
  node('B', 'completed', {
    children: [node('B1', 'completed'), node('B2', 'started', { position: 2 })]
  }),
  node('C', 'started', { gaps: [real('label-on-closed')], position: 1 }),
  node('D', 'canceled'),
  node('E', 'started', {
    children: [
      node('E1', 'started', { gaps: [real('stale')] }),
      node('E2', 'started')
    ]
  }),
  node('F', 'completed', { gaps: [cand('done-with-open-rows')] })
];

const only = (over: Partial<TreeFilter>): TreeFilter => ({
  ...NO_TREE_FILTER,
  ...over
});

describe('filterTree', () => {
  it.each([
    ['nothing: the open roots', {}, ['B', 'C', 'E', 'F']],
    [
      'Closed: adds the finished roots with no gap',
      { closed: true },
      ['A', 'B', 'C', 'D', 'E', 'F']
    ],
    ['Gaps', { gaps: true }, ['C', 'E', 'F']],
    ['Not queued', { unqueued: true }, ['E', 'F']],
    ['Gaps and Not queued', { gaps: true, unqueued: true }, ['E', 'F']],
    ['Closed and Gaps', { closed: true, gaps: true }, ['C', 'E', 'F']]
  ] satisfies [string, Partial<TreeFilter>, string[]][])(
    'keeps the roots for %s',
    (_name, over, kept) => {
      expect(filterTree(TREE, only(over)).map((r) => r.ticket)).toEqual(kept);
    }
  );

  it('keeps all the children of a kept root', () => {
    const [root] = filterTree(TREE, only({ gaps: true })).slice(1);
    expect(root?.children.map((c) => c.ticket)).toEqual(['E1', 'E2']);
  });

  it('counts a finished root with a gap as open', () => {
    expect(
      filterTree(
        [node('G', 'completed', { gaps: [real('x')] })],
        NO_TREE_FILTER
      )
    ).toHaveLength(1);
  });

  it('counts a finished root whose children were cut short as open', () => {
    const cut = node('H', 'completed', {
      truncated: true,
      children: [node('H1', 'completed')]
    });
    expect(filterTree([cut], NO_TREE_FILTER)).toHaveLength(1);
  });
});

describe('hasGap and hasPosition', () => {
  it('look at the root and its children', () => {
    expect(hasGap(TREE[4] ?? node('x', 'started'))).toBe(true);
    expect(hasGap(TREE[3] ?? node('x', 'started'))).toBe(false);
    expect(hasPosition(TREE[1] ?? node('x', 'started'))).toBe(true);
    expect(hasPosition(TREE[4] ?? node('x', 'started'))).toBe(false);
  });
});

describe('Not queued', () => {
  it('counts a waiting ticket, or a deep one with a position, as queued', () => {
    const waiting = node('W', 'started', { waiting: true });
    const deep = node('R', 'started', {
      children: [
        node('M', 'started', {
          children: [node('L', 'started', { position: 3 })]
        })
      ]
    });
    const plain = node('P', 'started');
    expect(
      filterTree([waiting, deep, plain], only({ unqueued: true })).map(
        (n) => n.ticket
      )
    ).toEqual(['P']);
  });
});

describe('worstChild', () => {
  const root = (children: QueueTreeNode[]) =>
    node('R', 'started', { children });

  it('ranks a real gap over a candidate over a blocker', () => {
    const r = node('1', 'started', { gaps: [real('stale')] });
    const c = node('2', 'started', { gaps: [cand('untouched')] });
    const block = node('3', 'started', { blockers: ['COD-9'] });
    expect(worstChild(root([block, c, r]))).toEqual({
      kind: 'conflict',
      text: 'stale'
    });
    expect(worstChild(root([block, c]))).toEqual({
      kind: 'held',
      text: 'untouched'
    });
    expect(worstChild(root([block]))).toEqual({
      kind: 'blocked',
      text: 'blocked by COD-9'
    });
    expect(worstChild(root([node('4', 'started')]))).toBeNull();
  });

  it('reads grandchildren too', () => {
    const deep = node('2', 'started', { gaps: [real('stale')] });
    expect(
      worstChild(root([node('1', 'started', { children: [deep] })]))
    ).toEqual({ kind: 'conflict', text: 'stale' });
  });

  it('ignores the root’s own gaps', () => {
    expect(
      worstChild(node('R', 'started', { gaps: [real('stale')] }))
    ).toBeNull();
  });
});
