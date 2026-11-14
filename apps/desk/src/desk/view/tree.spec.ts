import { describe, expect, it } from 'vitest';

import type { TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';

import { filterTree } from './tree';

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
  blockers: [],
  gaps: [],
  children: [],
  ...over
});

const TREE: QueueTreeNode[] = [
  node('A', 'completed', {
    children: [node('A1', 'completed'), node('A2', 'canceled')]
  }),
  node('B', 'completed', {
    children: [node('B1', 'completed'), node('B2', 'started')]
  }),
  node('C', 'started', { gaps: ['label-on-closed'] }),
  node('D', 'canceled'),
  node('E', 'started', {
    children: [
      node('E1', 'started', { gaps: ['stale'] }),
      node('E2', 'started')
    ]
  })
];

const open: TreeFilter = { scope: 'open', gaps: false };
const all: TreeFilter = { scope: 'all', gaps: false };

describe('filterTree', () => {
  it.each([
    ['open', open, ['B', 'C', 'E']],
    ['all', all, ['A', 'B', 'C', 'D', 'E']],
    ['gaps only, open', { scope: 'open', gaps: true }, ['C', 'E']],
    ['gaps only, all', { scope: 'all', gaps: true }, ['C', 'E']]
  ] satisfies [string, TreeFilter, string[]][])(
    'keeps the roots for %s',
    (_name, filter, kept) => {
      expect(filterTree(TREE, filter).map((r) => r.ticket)).toEqual(kept);
    }
  );

  it('keeps all the children of a kept root', () => {
    const [root] = filterTree(TREE, { scope: 'open', gaps: true }).slice(1);
    expect(root?.children.map((c) => c.ticket)).toEqual(['E1', 'E2']);
  });

  it('applies both filters together: a finished root with a gap only shows under All', () => {
    const gapped = [node('F', 'completed', { gaps: ['x'] })];
    expect(filterTree(gapped, { scope: 'open', gaps: true })).toEqual([]);
    expect(filterTree(gapped, { scope: 'all', gaps: true })).toHaveLength(1);
  });

  it('keeps a finished root with an open child and drops one with none', () => {
    expect(filterTree([TREE[1] ?? node('x', 'started')], open)).toHaveLength(1);
    expect(filterTree([TREE[3] ?? node('x', 'started')], open)).toEqual([]);
  });
});
