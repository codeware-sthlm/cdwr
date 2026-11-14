import type { TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';

// The Ticket tree's filters and roll-ups: which roots the page lists, and what a closed root shows

/** Done or canceled: nothing left to do on the ticket */
export const finished = (node: QueueTreeNode): boolean =>
  node.state === 'completed' || node.state === 'canceled';

/** A root and every descendant, in order */
const nodes = (root: QueueTreeNode): QueueTreeNode[] => [
  root,
  ...root.children.flatMap(nodes)
];

/** The queue picks the ticket, or waits on something for it */
const queued = (n: QueueTreeNode): boolean => n.position !== null || n.waiting;

/** The root and all its children are done or canceled */
export const finishedInFull = (root: QueueTreeNode): boolean =>
  nodes(root).every(finished);

/** A gap, real or candidate, on the root or a descendant */
export const hasGap = (root: QueueTreeNode): boolean =>
  nodes(root).some((n) => n.gaps.length > 0);

/** The queue would pick the root or a descendant, or waits on something for one */
export const hasPosition = (root: QueueTreeNode): boolean =>
  nodes(root).some(queued);

/** Finished in full and nothing to check: the roots Closed adds */
export const closedRoot = (root: QueueTreeNode): boolean =>
  finishedInFull(root) && !hasGap(root);

/**
 * The roots to list: the open ones, plus the closed ones with Closed. Gaps keeps a root with a gap
 * itself or in a child, Not queued one the queue would never pick. A kept root keeps all its children.
 */
export const filterTree = (
  tree: readonly QueueTreeNode[],
  filter: TreeFilter
): QueueTreeNode[] =>
  tree.filter(
    (root) =>
      (filter.closed || !closedRoot(root)) &&
      (!filter.gaps || hasGap(root)) &&
      (!filter.unqueued || !hasPosition(root))
  );

/** What a closed root shows of its children: the worst thing on any of them, as a chip kind and text */
export type Worst = { kind: 'conflict' | 'held' | 'blocked'; text: string };

/** The most severe chip among the descendants: a real gap, then a candidate, then a blocker; null with none */
export const worstChild = (root: QueueTreeNode): Worst | null => {
  const kids = root.children.flatMap(nodes);
  const gaps = kids.flatMap((c) => c.gaps);
  const real = gaps.find((g) => !g.candidate);
  if (real) return { kind: 'conflict', text: real.kind };
  const candidate = gaps[0];
  if (candidate) return { kind: 'held', text: candidate.kind };
  const blocker = kids.flatMap((c) => c.blockers)[0];
  return blocker ? { kind: 'blocked', text: `blocked by ${blocker}` } : null;
};
