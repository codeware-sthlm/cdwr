import { basename, dirname, join } from 'node:path';

const TICKET = /^COD-\d+$/i;
const TICKET_DIR = /^codeware-cod-\d+$/;

/** The repo the PR lookup asks; the queue's worktrees all belong to it */
export const REPO = 'codeware-sthlm/cdwr';

export const isTicket = (value: string): boolean => TICKET.test(value);

/** The checkout of a ticket: a sibling of the workspace, `codeware-cod-529` */
export const worktreePath = (root: string, ticket: string): string =>
  join(dirname(root), `codeware-${ticket.toLowerCase()}`);

/** Whether a checkout's directory name is one the queue creates for a ticket */
export const isTicketWorktree = (path: string): boolean =>
  TICKET_DIR.test(basename(path));

export interface WorktreeEntry {
  path: string;
  /** Short branch name; undefined for a detached or bare entry */
  branch?: string;
}

/** The entries of `git worktree list --porcelain` */
export const parseWorktreeList = (text: string): WorktreeEntry[] =>
  text
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      const path = lines
        .find((line) => line.startsWith('worktree '))
        ?.slice('worktree '.length);
      const ref = lines
        .find((line) => line.startsWith('branch '))
        ?.slice('branch '.length);
      return path === undefined
        ? undefined
        : {
            path,
            branch: ref?.replace(/^refs\/heads\//, '')
          };
    })
    .filter((entry) => entry !== undefined);

export const PR_STATES = ['OPEN', 'MERGED', 'CLOSED'] as const;
export type PrState = (typeof PR_STATES)[number];

/** The state of the first PR in `gh pr list --json number,state`; none when there is no PR */
export const parsePrState = (text: string): PrState | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const first: unknown = Array.isArray(parsed) ? parsed[0] : undefined;
  const state =
    typeof first === 'object' && first !== null && 'state' in first
      ? first.state
      : undefined;
  return PR_STATES.find((known) => known === state);
};

export interface Candidate {
  path: string;
  branch?: string;
  pr?: PrState;
  /** The folder is gone though git still lists the worktree */
  missing: boolean;
  dirty: boolean;
}

export type PruneVerdict =
  | { action: 'remove'; deleteBranch: boolean; reason: string }
  | { action: 'keep'; reason: string };

/** Remove only a checkout whose PR is done and whose tree is clean; keep the branch of a closed PR */
export const pruneVerdict = (candidate: Candidate): PruneVerdict => {
  const { pr, dirty, branch, missing } = candidate;
  if (missing) {
    return {
      action: 'keep',
      reason: 'folder is missing; `git worktree prune` drops it'
    };
  }
  if (branch === undefined) {
    return { action: 'keep', reason: 'no branch checked out' };
  }
  if (pr === undefined) return { action: 'keep', reason: 'no pull request' };
  if (pr === 'OPEN') {
    return { action: 'keep', reason: 'pull request is open' };
  }
  if (dirty) return { action: 'keep', reason: 'uncommitted changes' };
  return pr === 'MERGED'
    ? { action: 'remove', deleteBranch: true, reason: 'pull request merged' }
    : {
        action: 'remove',
        deleteBranch: false,
        reason: 'pull request closed, branch kept'
      };
};
