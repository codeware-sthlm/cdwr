import type { TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';

// The Ticket tree's filters: which roots the page lists

/** Done or canceled: nothing left to do on the ticket */
export const finished = (node: QueueTreeNode): boolean =>
  node.state === 'completed' || node.state === 'canceled';

/**
 * The roots to list. Open drops a root that is finished along with all its children; Gaps only
 * keeps a root that has a gap itself or in a child. A kept root keeps all its children.
 */
export const filterTree = (
  tree: readonly QueueTreeNode[],
  filter: TreeFilter
): QueueTreeNode[] =>
  tree.filter(
    (root) =>
      (filter.scope === 'all' ||
        !(finished(root) && root.children.every(finished))) &&
      (!filter.gaps ||
        root.gaps.length > 0 ||
        root.children.some((c) => c.gaps.length > 0))
  );
