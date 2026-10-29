import type { Issue } from '../linear';
import type { ActivityPayload, HostMetricRow, RunsPayload } from '../supabase';

import {
  AGENT,
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  HOST_STALE_MIN,
  HOST_SWAP_GROWTH_BYTES,
  HOST_WINDOW_MIN,
  INSTALL_MINUTES,
  LIMIT,
  LINEAR_ISSUE,
  OTHER_REPOS,
  SHIP_DAYS,
  STALE_HOURS,
  STATES,
  STATUS_RANK,
  STUCK_MIN,
  isClosed,
  waitName
} from './constants';
import { dayKey, runTime } from './format';
import { byCreated } from './parsers';
import { reconcileView } from './reconcile';
import type { DeskData, DeskState, Detail } from './state';
import type {
  PrRef,
  QueueAfter,
  QueueBefore,
  QueueFree,
  QueueLabel,
  QueueNext,
  QueueParked,
  QueueView,
  SessionState,
  Suggested
} from './types';

// The model: everything the renderers read, computed from the state. Nothing here touches the DOM.

export type Run = RunsPayload['rows'][number];

/** What the page needs of a ticket; a stub stands in for one the lists do not hold */
export type TicketRef = Pick<
  Issue,
  'id' | 'title' | 'url' | 'status' | 'completedAt'
> & { priority: Issue['priority'] | null };

export type Blocker = { ticket: string; pr: PrRef | null };

export type Slot = {
  ticket: string;
  pr: PrRef | null | undefined;
  why: string;
};

export type IdeaVerdict = 'discarded' | 'accepted' | 'to decide';

export type Model = {
  all: Issue[];
  runs: RunsPayload | null;
  v: QueueView | null;
  get: (id: string) => TicketRef;
  before: QueueBefore[];
  plans: QueueBefore[];
  questions: QueueBefore[];
  /** Sub-issues ready to label `agent:ready`; they wait on you but do not count toward the limit */
  toLabel: QueueLabel[];
  after: QueueAfter[];
  /** Open PRs in merge order */
  prs: QueueAfter[];
  prBlockers: Map<string, Blocker[]>;
  /** Open PRs whose ticket is parked on a wait (review fixes on CI); kept out of `parked` and `next` */
  prWaits: Map<string, QueueParked>;
  handoffs: QueueAfter[];
  handoffItems: number;
  next: QueueNext[];
  parked: QueueParked[];
  held: { tickets: string[]; free: QueueFree[] };
  limit: { used: number; max: number };
  slots: Slot[];
  session: SessionState | null;
  /** Minutes a session has polled while the queue had work for it, once that passes STUCK_MIN */
  stuck: number | null;
  runProblems: Run[];
  /** Hours since the last run; null without one */
  lastRunAge: number | null;
  staleHours: number;
  schedulerStale: boolean;
  installStale: boolean;
  ideasPending: Issue[];
  ideasAccepted: Issue[];
  ideasDiscarded: Issue[];
  suggested: Suggested | null;
  /** The scheduler's next run in ms; null without a last run */
  nextRun: number | null;
  /** The scheduler's interval in minutes; the fallback interval while live */
  runMinutes: number;
  /** The listener wakes the scheduler on events */
  live: boolean;
  /** Minutes since the activity table was updated; null without one */
  activityAge: number | null;
  /** Activity events in the last 24 hours */
  activityDay: number;
  /** The queue host's load; null without a sample */
  host: HostHealth | null;
};

const rankOf = (i: Pick<Issue, 'priority'>): number => i.priority.value || 5;
const statusOf = (i: Pick<Issue, 'statusType'>): number =>
  STATUS_RANK.get(i.statusType) ?? 4;

export const byQueue = (
  a: Pick<Issue, 'statusType' | 'priority' | 'createdAt'>,
  b: Pick<Issue, 'statusType' | 'priority' | 'createdAt'>
): number =>
  statusOf(a) - statusOf(b) ||
  rankOf(a) - rankOf(b) ||
  a.createdAt.localeCompare(b.createdAt);

/** The ticket's Agent state: `working` for `agent:working`; null without an Agent label */
export const agentState = (i: Pick<Issue, 'labels'>): string | null =>
  i.labels.find((l) => AGENT.includes(l))?.slice(6) || null;

const isOtherRepo = (i: Pick<Issue, 'labels'>): boolean =>
  i.labels.some((l) => OTHER_REPOS.includes(l));

/** Open tickets of this repo in the agent's order */
export const openIssues = (data: DeskData): Issue[] => {
  const seen = new Map<string, Issue>();
  for (const s of STATES)
    for (const i of data.buckets.get(s) ?? []) {
      if (isClosed(i.statusType) || isOtherRepo(i)) continue;
      seen.set(i.id, i);
    }
  return [...seen.values()].sort(byQueue);
};

export const ideaVerdict = (i: Issue): IdeaVerdict =>
  i.statusType === 'canceled'
    ? 'discarded'
    : agentState(i) || i.statusType === 'completed'
      ? 'accepted'
      : 'to decide';

/** Titles and links for the ids the queue view names: open tickets, then the recently closed */
export const issueIndex = (data: DeskData): Map<string, Issue> => {
  const map = new Map<string, Issue>();
  for (const i of data.closed ?? []) map.set(i.id, i);
  for (const s of STATES)
    for (const i of data.buckets.get(s) ?? []) map.set(i.id, i);
  return map;
};

const stub = (id: string): TicketRef => ({
  id,
  title: '',
  url: LINEAR_ISSUE + id,
  status: '',
  completedAt: null,
  priority: null
});

/** Blockers before the PRs they block, otherwise the queue view's order; a cycle is cut where it closes */
export const mergeOrder = <T extends { ticket: string }>(
  prs: readonly T[],
  blockersOf: (ticket: string) => readonly string[]
): T[] => {
  const byTicket = new Map(prs.map((x) => [x.ticket, x]));
  const placed = new Set<string>();
  const out: T[] = [];
  const visit = (x: T, path: Set<string>): void => {
    if (placed.has(x.ticket) || path.has(x.ticket)) return;
    path.add(x.ticket);
    for (const b of blockersOf(x.ticket)) {
      const blocker = byTicket.get(b);
      if (blocker) visit(blocker, path);
    }
    path.delete(x.ticket);
    placed.add(x.ticket);
    out.push(x);
  };
  for (const x of prs) visit(x, new Set());
  return out;
};

/** The ticket's PR: the one the queue view knows, else the one attached in Linear */
export const prOf = (
  details: ReadonlyMap<string, Detail>,
  id: string,
  known?: PrRef | null
): PrRef | null => known || details.get(id)?.pr || null;

/** Whether the activity data is flagged missing; the payload does not carry the flag today, so this reads false until it does */
export const activityMissing = (activity: ActivityPayload): boolean =>
  'missing' in activity && Boolean(activity.missing);

export const isProblem = (outcome: string): boolean =>
  !/^(idle|planned( [A-Z]+-\d+)?|launched|implemented|suggested( [A-Z]+-\d+)?|nothing|skip)$/.test(
    outcome
  );

/** The scheduler's next run: the last run plus whole intervals. Sleep shifts launchd's grid, hence "about". */
const nextRunOf = (
  runs: RunsPayload | null,
  minutes: number,
  now: Date
): number | null => {
  const last = runs?.last;
  if (!last) return null;
  const step = minutes * 6e4;
  const at = now.getTime();
  let t = runTime(last.when) + step;
  if (t < at) t += Math.ceil((at - t) / step) * step;
  return t;
};

/** What one sample says, as shares of what the host has; load is per core and can pass 1 */
export type HostFigures = {
  load: number;
  mem: number;
  swap: number;
  disk: number;
  /** The container's memory against its limit; null without a limit */
  container: number | null;
};

export type HostProblem = 'load' | 'memory' | 'swap' | 'disk';

export type HostHealth = {
  host: string;
  /** `stale`: the newest sample is older than HOST_STALE_MIN, so the figures are history */
  verdict: 'ok' | 'bad' | 'stale';
  problems: HostProblem[];
  latest: HostMetricRow;
  /** Minutes since the newest sample */
  ageMin: number;
  figures: HostFigures;
  /** Averages over the HOST_WINDOW_MIN before the newest sample */
  average: HostFigures;
  swapGrowing: boolean;
  /** The host's samples, oldest first */
  series: HostMetricRow[];
};

const share = (part: number, whole: number): number =>
  whole > 0 ? part / whole : 0;

const mean = (xs: readonly number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const swapUsed = (r: HostMetricRow): number => r.swap_total - r.swap_free;

/** Load is the 5-minute average, which a sample every 10 minutes does not alias the way the 1-minute one would */
export const hostFigures = (r: HostMetricRow): HostFigures => ({
  load: share(r.load5, r.cores),
  mem: share(r.mem_total - r.mem_available, r.mem_total),
  swap: share(swapUsed(r), r.swap_total),
  disk: share(r.disk_total - r.disk_free, r.disk_total),
  container:
    r.cgroup_mem_current !== null && r.cgroup_mem_max !== null
      ? share(r.cgroup_mem_current, r.cgroup_mem_max)
      : null
});

const averageFigures = (all: readonly HostFigures[]): HostFigures => {
  const containers = all.flatMap((f) =>
    f.container === null ? [] : [f.container]
  );
  return {
    load: mean(all.map((f) => f.load)),
    mem: mean(all.map((f) => f.mem)),
    swap: mean(all.map((f) => f.swap)),
    disk: mean(all.map((f) => f.disk)),
    container: containers.length ? mean(containers) : null
  };
};

/** The host with the newest sample: its latest figures, 30-minute averages and verdict; null without samples */
export const hostHealth = (
  rows: readonly HostMetricRow[] | null,
  now: Date
): HostHealth | null => {
  const all = rows ?? [];
  const at = (r: HostMetricRow): number => Date.parse(r.at);
  const newestRow = all.reduce<HostMetricRow | null>(
    (a, b) => (a && at(a) >= at(b) ? a : b),
    null
  );
  if (!newestRow) return null;
  const series = all
    .filter((r) => r.host === newestRow.host)
    .sort((a, b) => at(a) - at(b));
  const latest = series[series.length - 1];
  const recent = series.filter(
    (r) => at(r) >= at(latest) - HOST_WINDOW_MIN * 6e4
  );
  const figures = hostFigures(latest);
  const average = averageFigures(recent.map(hostFigures));
  const swapGrowing =
    swapUsed(latest) > 0 &&
    swapUsed(latest) - swapUsed(recent[0]) > HOST_SWAP_GROWTH_BYTES;
  const problems: HostProblem[] = [];
  if (average.load > HOST_LOAD_PER_CORE_MAX) problems.push('load');
  if (figures.mem > HOST_MEM_USED_MAX) problems.push('memory');
  if (swapGrowing) problems.push('swap');
  if (1 - figures.disk < HOST_DISK_FREE_MIN) problems.push('disk');
  const ageMin = (now.getTime() - at(latest)) / 6e4;
  return {
    host: latest.host,
    verdict: ageMin > HOST_STALE_MIN ? 'stale' : problems.length ? 'bad' : 'ok',
    problems,
    latest,
    ageMin,
    figures,
    average,
    swapGrowing,
    series
  };
};

export type ShippedDay = { key: string; items: Issue[] };

export type Shipped = { days: ShippedDay[]; total: number; week: number };

/** Agent tickets closed per day over the last SHIP_DAYS days, the one trend on the page */
export const shipped = (
  closed: readonly Issue[] | null,
  now: Date
): Shipped => {
  const today = new Date(now.getTime());
  today.setHours(12, 0, 0, 0);
  const days: ShippedDay[] = [];
  for (let k = SHIP_DAYS - 1; k >= 0; k--)
    days.push({ key: dayKey(today.getTime() - k * 864e5), items: [] });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const i of closed ?? []) {
    if (!i.completedAt || !i.labels.some((l) => l.startsWith('agent:')))
      continue;
    if (isOtherRepo(i)) continue;
    byKey.get(dayKey(i.completedAt))?.items.push(i);
  }
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const week = days.slice(-7).reduce((n, d) => n + d.items.length, 0);
  return { days, total, week };
};

export const model = (state: DeskState, now: Date): Model => {
  const { data, details, liveHandoffs } = state;
  const { runs, ideas, activity } = data;
  const nowMs = now.getTime();
  const idx = issueIndex(data);
  // The scheduler's snapshot, without what a live Linear change has overtaken since
  const v = runs?.qv
    ? reconcileView(runs.qv, {
        issue: (id) => idx.get(id),
        nextLine: (id) => details.get(id)?.next
      })
    : null;
  const get = (id: string): TicketRef => idx.get(id) ?? stub(id);

  const before = v ? v.table.before : [];
  const toLabel = v ? v.table.label : [];
  const after = v ? v.table.after : [];

  // Open PRs in merge order: a ticket's PR waits for the open tickets it is blocked by in Linear
  const openPrs = after.filter((x) => x.kind === 'pr');
  const prByTicket = new Map(openPrs.map((x) => [x.ticket, x]));
  const blockersOf = (id: string): string[] =>
    (details.get(id)?.blockedBy ?? []).filter((b) => {
      const i = idx.get(b);
      return i !== undefined && !isClosed(i.statusType);
    });
  const prs = mergeOrder(openPrs, blockersOf);
  const prBlockers = new Map(
    prs.map((x) => [
      x.ticket,
      blockersOf(x.ticket).map((b): Blocker => {
        const blocker = prByTicket.get(b);
        return {
          ticket: b,
          pr: blocker ? prOf(details, b, blocker.pr) : null
        };
      })
    ])
  );

  // Which tickets have hand-offs comes from the queue view; which items are still open, from Linear directly
  const handoffs = after
    .filter((x) => x.kind === 'handoffs')
    .map((x) => {
      const live = liveHandoffs.get(x.ticket);
      return live ? { ...x, items: live } : x;
    })
    .filter((x) => x.items?.length);

  // A parked review (its fixes on CI) shows as its open PR, with the wait as the row's note
  const prWaits = new Map(
    (v ? v.parked : [])
      .filter((p) => prByTicket.has(p.ticket))
      .map((p) => [p.ticket, p])
  );
  const parked = (v ? v.parked : []).filter((p) => !prWaits.has(p.ticket));
  const slots = new Map<string, Slot>();
  for (const x of prs)
    slots.set(x.ticket, {
      ticket: x.ticket,
      pr: x.pr,
      why: 'open PR, in review'
    });
  for (const p of parked)
    if (!slots.has(p.ticket))
      slots.set(p.ticket, {
        ticket: p.ticket,
        pr: p.pr,
        why: `PR waits on ${waitName(p.wait) || String(p.wait)}`
      });

  const next = (v ? v.next : []).filter(
    (x) => !(x.reason === 'parked wait resolved' && prWaits.has(x.ticket))
  );
  const session = v ? v.session : null;
  // Polling since its last heartbeat while the queue view, taken later, has work for it: wait.sh never woke it
  const polled =
    session?.state === 'alive' &&
    session.detail === 'polling' &&
    session.lastSeen &&
    v?.at &&
    next.length
      ? (Date.parse(v.at) - Date.parse(session.lastSeen)) / 6e4
      : null;
  const stuck = polled !== null && polled >= STUCK_MIN ? polled : null;

  // A problem counts until a later run goes well: an OK row, or an OK last-run line
  const day = nowMs - 864e5;
  const rows = runs?.rows ?? [];
  const okTimes = rows
    .filter((r) => !isProblem(r.outcome))
    .map((r) => runTime(r.when));
  if (runs?.last && !isProblem(runs.last.outcome))
    okTimes.push(runTime(runs.last.when));
  const lastOk = Math.max(0, ...okTimes);
  const runProblems = rows.filter(
    (r) =>
      isProblem(r.outcome) && runTime(r.when) >= day && runTime(r.when) > lastOk
  );
  const lastRunAge = runs?.last
    ? (nowMs - runTime(runs.last.when)) / 36e5
    : null;
  // Idle runs publish at most hourly, so a slow interval stretches what counts as silent
  const staleHours = Math.max(
    STALE_HOURS,
    (2 * (runs?.job?.minutes || 0)) / 60 + 1
  );
  const runMinutes = runs?.job?.minutes || INSTALL_MINUTES;

  // The daily suggestion: an agent-idea ticket without an Agent label waits on Håkan's verdict
  const allIdeas = (ideas ?? []).filter((i) => !isOtherRepo(i));

  return {
    all: openIssues(data),
    runs,
    v,
    get,
    before,
    plans: before.filter((x) => x.kind === 'plan'),
    questions: before.filter((x) => x.kind !== 'plan'),
    toLabel,
    after,
    prs,
    prBlockers,
    prWaits,
    handoffs,
    handoffItems: handoffs.reduce((n, x) => n + (x.items?.length || 0), 0),
    next,
    parked,
    held: v ? v.held : { tickets: [], free: [] },
    limit: v ? v.limit : { used: 0, max: LIMIT },
    slots: [...slots.values()],
    session,
    stuck,
    runProblems,
    lastRunAge,
    staleHours,
    schedulerStale: lastRunAge === null || lastRunAge > staleHours,
    installStale: runs?.job?.install === 'stale',
    ideasPending: allIdeas
      .filter((i) => ideaVerdict(i) === 'to decide')
      .sort(byCreated),
    ideasAccepted: allIdeas
      .filter((i) => ideaVerdict(i) === 'accepted')
      .sort(byCreated)
      .reverse(),
    ideasDiscarded: allIdeas
      .filter((i) => ideaVerdict(i) === 'discarded')
      .sort((a, b) => (b.canceledAt ?? '').localeCompare(a.canceledAt ?? '')),
    suggested: runs?.suggested ?? null,
    nextRun: nextRunOf(runs, runMinutes, now),
    runMinutes,
    live: runs?.job?.live ?? false,
    activityAge: activity?.updated
      ? (nowMs - Date.parse(activity.updated.replace(' ', 'T'))) / 6e4
      : null,
    activityDay: (activity?.rows ?? []).filter(
      (r) => nowMs - runTime(r.when) <= 864e5
    ).length,
    host: hostHealth(data.hostMetrics, now)
  };
};
