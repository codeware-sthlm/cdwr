import type { Review } from '@codeware/shared/util/agent-review';

/** The newest `reviews` row: what the review run handed the desk, and when, where and at what cost */
export type ReviewRecord = Review & {
  id: number;
  host: string;
  /** ISO */
  at: string;
  cost: number | null;
  model: string | null;
};

/** A path a queue_state view fails to parse at; `missing` when the field is absent rather than mistyped */
export type ViewIssue = { path: string; missing: boolean };

/** What `parsePlan` reads from a ticket description's Status table */
export type PlanProgress = {
  steps: number;
  done: number;
  next: string | null;
};

/** A line of the "Suggested:" value; `title` only when a ticket was suggested */
export type Suggested =
  | { date: string; kind: 'open'; ticket: string; text: string }
  | {
      date: string;
      kind: 'suggested';
      ticket: string;
      title: string;
      text: string;
    }
  | {
      date: string;
      kind: 'nothing' | 'cap' | 'failed' | 'other';
      text: string;
    };

/** A suggestion's description, as the suggest-improvement skill writes it */
export type Idea = {
  evidence: string[];
  change: string;
  cost: string;
  focus: string;
  why: string;
};

export type JobHost = 'container' | 'launchd';

export type Job = {
  line: string;
  minutes: number | null;
  /** The listener wakes the scheduler on events; `minutes` is then the fallback interval */
  live: boolean;
  host: JobHost | null;
  rev: string | null;
  install: 'stale' | 'current' | 'unknown';
  items: string;
  /** The day's implement spend against its daily cap, in dollars; null when the line does not carry them */
  effort: { spent: number; cap: number } | null;
  /** The queue is paused (`cdwr agent pause`): the tick publishes and starts nothing */
  paused: boolean;
};

export type AttendedVerdict = 'running' | 'run now' | 'idle';

export type Attended = { verdict: AttendedVerdict; text: string };

/** A pull request number, as the queue view carries it */
export type PrRef = number | string;

export type SessionState = {
  state: string;
  detail?: string | null;
  id?: string | null;
  ticket?: string | null;
  lastSeen?: string | null;
};

export type QueueNext = {
  ticket: string;
  reason?: string;
  detail?: string | null;
};

export type QueueFree = {
  action?: string;
  ticket?: string;
  pr?: PrRef | null;
  value?: number | string;
};

export type QueueParked = {
  ticket: string;
  wait?: string;
  pr?: PrRef | null;
  since?: string;
  resolved?: boolean | null;
  outcome?: string | null;
  /** Of a wait on Copilot: the PR's copilot state in the watch; null without a watch entry, and absent on older views */
  copilot?: 'none' | 'requested' | 'reviewed' | null;
  /** Of a wait on Copilot: the scheduler's one automatic request for the PR; null when it made none, absent on older views */
  copilotAsked?: { at: string; ok: boolean; why: string | null } | null;
};

/** A Renovate PR the queue tends or that needs a hand: failing checks, a conflict, or a ticket tending it */
export type QueueRenovate = {
  pr: PrRef;
  title: string;
  state: 'failing' | 'conflicting' | 'tended';
  ticket: string | null;
};

/** A ticket state the queue cannot resolve by itself (watch.jq `audit`): what is wrong and the one action that fixes it */
export type QueueGap = {
  id: string;
  ticket: string;
  /** The ticket's own title, for one the desk's index does not hold (a canceled one) */
  title?: string;
  kind: string;
  what: string;
  fix: string;
  /** A hint to check, not a finding: it does not count as a gap */
  candidate?: boolean;
  /** The rows of the ticket's Status table the rule read, for a candidate */
  rows?: string[];
};

/** A gap on a tree node: its audit kind, and whether it is a candidate to check rather than a finding */
export type QueueTreeGap = { kind: string; candidate: boolean };

/** One ticket of the queue's tree (watch.jq `tree`): a node carries its sub-issues, nested */
export type QueueTreeNode = {
  ticket: string;
  title: string | null;
  /** The Linear state type: triage, backlog, unstarted, started, completed or canceled */
  state: string | null;
  /** The ticket's `agent:*` label, e.g. `agent:working` */
  label: string | null;
  pr: number | null;
  /** The 1-based place in the queue's pick order; null when the queue would never pick it */
  position: number | null;
  /** An open agent ticket without a position: the queue waits on something (a review, an answer, a blocker) */
  waiting: boolean;
  /** Open blockers */
  blockers: string[];
  /** The audit's gaps on the ticket */
  gaps: QueueTreeGap[];
  /** Set on a root whose children the scheduler cut short */
  truncated?: boolean;
  children: QueueTreeNode[];
};

export type QueueBefore = { ticket: string; kind?: string };

/** An open sub-issue whose blockers are done, waiting for `agent:ready`; not held by the limit */
export type QueueLabel = {
  ticket: string;
  parent: string | null;
  blockers: string[];
};

export type QueueAfter = {
  ticket: string;
  kind?: string;
  pr?: PrRef | null;
  items?: string[];
};

/**
 * What a host's watch.json says of one agent ticket's PR (the `queue_state` row's `watch`). The
 * fields older rows lack are null: `ci` (GitHub's rollup: SUCCESS, PENDING, FAILURE, ERROR,
 * EXPECTED), `threads` (unresolved review threads) and `copilot`.
 */
export type WatchEntry = {
  pr: number;
  state: 'open' | 'queued' | 'failing' | 'conflicting' | 'merged' | 'closed';
  unresolved: number;
  threads: number | null;
  /** null: GitHub has not checked yet */
  conflicting: boolean | null;
  /** The PR is a draft; false for an entry without the field */
  draft: boolean;
  /** GitHub's raw mergeability (`UNKNOWN` while it computes it); null for an entry without the field */
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null;
  ci: string | null;
  copilot: 'none' | 'requested' | 'reviewed' | null;
  /** When the host last wrote the entry, ISO; null without one */
  at: string | null;
};

/** The queue view (watch.jq `queue_view`) after the page's defaults are applied */
export type QueueView = {
  at: string | undefined;
  limit: { used: number; max: number };
  session: SessionState;
  next: QueueNext[];
  held: { tickets: string[]; free: QueueFree[] };
  parked: QueueParked[];
  /** Answered plans held by open blockers; they are in neither `next` nor `table.before` */
  blocked: { ticket: string; blockers: string[] }[];
  renovate: QueueRenovate[];
  /** Older views have none */
  audit: QueueGap[];
  /** Older views have none */
  tree: QueueTreeNode[];
  table: { before: QueueBefore[]; label: QueueLabel[]; after: QueueAfter[] };
};
