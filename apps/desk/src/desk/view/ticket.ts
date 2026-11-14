import type { Issue, StatusType } from '../../linear';
import type { SnoozeRow, UsagePayload } from '../../supabase';
import { LINEAR_ISSUE } from '../constants';
import { runTime } from '../format';
import { type Model, type WatchRef, prOf } from '../model';
import type { DeskState, Detail } from '../state';
import type {
  PrRef,
  QueueGap,
  QueueNext,
  QueueParked,
  QueueTreeNode
} from '../types';

import { queuePr } from './pr';

// Everything the desk holds about one ticket, for the Ticket sheet

/** The newest activity rows a ticket's state carries */
export const ACTIVITY_MAX = 10;

export type TicketLinear = {
  title: string;
  status: { name: string; type: StatusType };
  labels: string[];
  /** Linear's priority value: 1 urgent to 4 low, 0 none */
  priority: number;
  url: string;
  updatedAt: string;
};

/** Where the scheduler has the ticket; a field is empty when it does not apply */
export type TicketQueue = {
  next: Pick<QueueNext, 'reason' | 'detail'> | null;
  parked: Pick<QueueParked, 'wait' | 'since' | 'resolved' | 'outcome'> | null;
  /** The ticket holds one of the limit's slots */
  held: boolean;
  /** Open blockers */
  blockedBy: string[];
  /** Waiting for `agent:ready`, under this parent */
  toLabel: { parent: string | null } | null;
  /** An open PR waits for review; `pr` is its number when known */
  review: { pr: PrRef | null } | null;
  /** The hand-off items still unticked */
  handoffs: string[];
};

export type TicketRelative = {
  id: string;
  title: string;
  /** The Linear state type; null when the queue's tree does not say */
  state: string | null;
};

export type TicketTree = {
  parent: TicketRelative | null;
  siblings: TicketRelative[];
  children: TicketRelative[];
  /** The scheduler cut the children short */
  truncated: boolean;
};

export type TicketSession = {
  id: string | null;
  state: string;
  detail: string | null;
  /** The host and kind of the sessions row; null when no row carries the id */
  host: string | null;
  kind: string | null;
  /** The newest heartbeat, ISO; null without one */
  lastSeen: string | null;
};

export type TicketPlan = { done: number; steps: number; next: string | null };

export type TicketSpend = Pick<
  UsagePayload['tickets'][number],
  'planning' | 'orchestrating' | 'implementing' | 'total'
>;

/** One event of the ticket's history, from the Linear activity or from GitHub */
export type TicketEvent = {
  /** In ms */
  at: number;
  text: string;
  source: 'activity' | 'github';
};

export type TicketState = {
  id: string;
  /** The Linear URL */
  url: string;
  /** The desk holds something about the ticket */
  known: boolean;
  linear: TicketLinear | null;
  queue: TicketQueue | null;
  tree: TicketTree | null;
  pr: WatchRef | null;
  gaps: QueueGap[] | null;
  session: TicketSession | null;
  plan: TicketPlan | null;
  snooze: SnoozeRow | null;
  spend: TicketSpend | null;
  /** Newest first, at most ACTIVITY_MAX; null without any */
  activity: TicketEvent[] | null;
};

const issueOf = (m: Model, state: DeskState, id: string): Issue | undefined =>
  [...m.all, ...(state.data.closed ?? []), ...(state.data.ideas ?? [])].find(
    (i) => i.id === id
  );

const linearOf = (i: Issue | undefined): TicketLinear | null =>
  i
    ? {
        title: i.title,
        status: { name: i.status, type: i.statusType },
        labels: i.labels,
        priority: i.priority.value,
        url: i.url,
        updatedAt: i.updatedAt
      }
    : null;

const queueOf = (m: Model, id: string): TicketQueue | null => {
  const next = m.next.find((x) => x.ticket === id);
  const parked = m.parked.find((x) => x.ticket === id) ?? m.prWaits.get(id);
  const blocking = [
    ...(m.blockers.get(id) ?? []),
    ...(m.heldApprovals.find((x) => x.ticket === id)?.blockers ?? [])
  ].map((b) => b.ticket);
  const label = m.toLabel.find((x) => x.ticket === id);
  const review = m.prs.find((x) => x.ticket === id);
  const queue: TicketQueue = {
    next: next ? { reason: next.reason, detail: next.detail } : null,
    parked: parked
      ? {
          wait: parked.wait,
          since: parked.since,
          resolved: parked.resolved,
          outcome: parked.outcome
        }
      : null,
    held: m.held.tickets.includes(id),
    blockedBy: [...new Set(blocking)],
    toLabel: label ? { parent: label.parent } : null,
    review: review ? { pr: review.pr ?? null } : null,
    handoffs: m.handoffs.find((x) => x.ticket === id)?.items ?? []
  };
  const applies =
    queue.next !== null ||
    queue.parked !== null ||
    queue.held ||
    queue.blockedBy.length > 0 ||
    queue.toLabel !== null ||
    queue.review !== null ||
    queue.handoffs.length > 0;
  return applies ? queue : null;
};

const relative = (n: QueueTreeNode): TicketRelative => ({
  id: n.ticket,
  title: n.title ?? '',
  state: n.state
});

const treeOf = (m: Model, id: string): TicketTree | null => {
  const root = m.tree.find((r) => r.ticket === id);
  if (root)
    return {
      parent: null,
      siblings: [],
      children: root.children.map(relative),
      truncated: root.truncated === true
    };
  const parent = m.tree.find((r) => r.children.some((c) => c.ticket === id));
  if (!parent) return null;
  return {
    parent: relative(parent),
    siblings: parent.children.filter((c) => c.ticket !== id).map(relative),
    children: [],
    truncated: parent.truncated === true
  };
};

const sessionOf = (
  m: Model,
  state: DeskState,
  id: string
): TicketSession | null => {
  const s = m.session;
  if (!s || s.ticket !== id || s.state === 'ended') return null;
  const row = (state.data.sessions ?? []).find((r) => r.id === s.id);
  return {
    id: s.id ?? null,
    state: s.state,
    detail: s.detail ?? null,
    host: row?.host ?? null,
    kind: row?.kind ?? null,
    lastSeen: s.lastSeen ?? row?.last_seen ?? null
  };
};

const planOf = (d: Detail | undefined): TicketPlan | null =>
  d && d.steps > 0 ? { done: d.done, steps: d.steps, next: d.next } : null;

const spendOf = (state: DeskState, id: string): TicketSpend | null => {
  const t = state.data.usage?.tickets.find((x) => x.ticket === id);
  return t
    ? {
        planning: t.planning,
        orchestrating: t.orchestrating,
        implementing: t.implementing,
        total: t.total
      }
    : null;
};

/** The ticket's activity rows and its PR's GitHub events, newest first */
const eventsOf = (
  m: Model,
  state: DeskState,
  id: string,
  watch: WatchRef | null
): TicketEvent[] | null => {
  const n = Number(
    prOf(state.details, id, queuePr(m, id)) ?? watch?.entry.pr ?? NaN
  );
  const rows = (state.data.activity?.rows ?? [])
    .filter((r) => r.ticket === id)
    .map((r): TicketEvent => ({
      at: runTime(r.when),
      text: r.change,
      source: 'activity'
    }));
  const events = (state.data.githubEvents ?? [])
    .filter((e) => e.pr !== null && e.pr === n)
    .map((e): TicketEvent => ({
      at: Date.parse(e.updated_at),
      text: `PR ${n} ${e.action}`,
      source: 'github'
    }));
  const newest = [...rows, ...events]
    .sort((a, b) => b.at - a.at)
    .slice(0, ACTIVITY_MAX);
  return newest.length ? newest : null;
};

/** Everything the desk holds about a ticket; each part is null when it holds nothing for it */
export const ticketState = (
  m: Model,
  state: DeskState,
  id: string
): TicketState => {
  const linear = linearOf(issueOf(m, state, id));
  const queue = queueOf(m, id);
  const tree = treeOf(m, id);
  const pr = m.watch.get(id) ?? null;
  const gaps = m.gaps.filter((g) => g.ticket === id);
  const session = sessionOf(m, state, id);
  const plan = planOf(state.details.get(id));
  const snooze =
    (state.data.snoozes ?? []).find((s) => s.ticket === id) ?? null;
  const spend = spendOf(state, id);
  const activity = eventsOf(m, state, id, pr);
  const parts = [
    linear,
    queue,
    tree,
    pr,
    gaps.length ? gaps : null,
    session,
    plan,
    snooze,
    spend,
    activity
  ];
  return {
    id,
    url: linear?.url ?? LINEAR_ISSUE + id,
    known: parts.some((p) => p !== null),
    linear,
    queue,
    tree,
    pr,
    gaps: gaps.length ? gaps : null,
    session,
    plan,
    snooze,
    spend,
    activity
  };
};
