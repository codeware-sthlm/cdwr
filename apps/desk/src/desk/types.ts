/** What `parsePlan` reads from a ticket description's Status table */
export type PlanProgress = {
  steps: number;
  done: number;
  next: string | null;
};

/** A line of the "Suggested:" document line; `title` only when a ticket was suggested */
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
  host: JobHost | null;
  rev: string | null;
  install: 'stale' | 'current' | 'unknown';
  items: string;
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
};

export type QueueBefore = { ticket: string; kind?: string };

export type QueueAfter = {
  ticket: string;
  kind?: string;
  pr?: PrRef | null;
  items?: string[];
};

/** The queue view (watch.jq `queue_view`) after the page's defaults are applied */
export type QueueView = {
  at: string | undefined;
  limit: { used: number; max: number };
  session: SessionState;
  next: QueueNext[];
  held: { tickets: string[]; free: QueueFree[] };
  parked: QueueParked[];
  table: { before: QueueBefore[]; after: QueueAfter[] };
};
