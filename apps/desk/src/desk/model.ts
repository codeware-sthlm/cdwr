import { deskSha } from '../build-info';
import type { Issue } from '../linear';
import type {
  ActivityPayload,
  HostMetricRow,
  PlanUsageRow,
  RunsPayload,
  SessionRow,
  UsageHourRow
} from '../supabase';

import {
  AGENT,
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  HOST_SWAP_GROWTH_BYTES,
  HOST_WINDOW_MIN,
  INSTALL_MINUTES,
  LIMIT,
  LINEAR_ISSUE,
  OTHER_REPOS,
  PLAN_PROJECT_AFTER,
  PLAN_RESET_DRIFT_MS,
  PLAN_STALE_MIN,
  PLAN_WARN_PCT,
  PLAN_WINDOW_H,
  ROLES,
  SHIP_DAYS,
  STALE_HOURS,
  STATES,
  STATUS_RANK,
  STUCK_MIN,
  isClosed,
  waitName
} from './constants';
import { dayKey, runTime } from './format';
import {
  type AgentPr,
  type HandBack,
  type HealthCheck,
  type HostSessions,
  type Problem,
  type Pulse,
  agentPrs,
  checkProblems,
  feed,
  handBack,
  health,
  hostHeartbeats,
  hostSessions,
  problems,
  pulse,
  sampleMinutes,
  silentAfter
} from './live';
import { byCreated } from './parsers';
import { reconcileView } from './reconcile';
import type { DeskData, DeskState, Detail } from './state';
import type {
  Job,
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

/** A running build against main's newest, both as `sha-<7 chars>` */
export type Behind = { runs: string; main: string };

/** What bounds the agent: PRs in flight, the day's implement spend, and a pause */
export type Limits = {
  /** Agent PRs in flight against the limit (the queue view's) */
  prs: { used: number; max: number };
  /** The day's implement spend against its cap; null when the scheduler does not publish it */
  effort: { spent: number; cap: number; share: number } | null;
  /** The queue is paused; false when unknown */
  paused: boolean;
};

/** The NUC at a glance: the verdict and the newest sample's shares */
export type NucBlock = {
  host: string;
  verdict: HostHealth['verdict'];
  ageMin: number;
  /** load1 / cores of the newest sample; the verdict keeps the 30-min load5 average */
  cpu: number;
  /** The container's memory against its limit when both cgroup figures are set, else the host's */
  memory: number;
  memorySource: 'container' | 'host';
  disk: number;
  /** A run is open now */
  busy: boolean;
};

export type CpuBand = { start: number; end: number; ticket: string | null };

/** The NUC's CPU over the last 24 hours against the scheduler's runs */
export type CpuDay = {
  /** The window in ms: now − 24 h, now */
  from: number;
  to: number;
  /** The host's samples in the window, cpu = load1 / cores, oldest first */
  points: { at: number; cpu: number }[];
  /** Runs over the window, from started to finished (an open run to now), clipped to the window, oldest first */
  bands: CpuBand[];
  /** Mean cpu of the points outside any band; null when there are none */
  idle: number | null;
  /** Mean cpu of the points inside a band; null when there are none */
  inRuns: number | null;
  /** The highest point, with the ticket of the band it falls in */
  peak: { at: number; cpu: number; ticket: string | null } | null;
};

/** A Mac session seen today; sessions carry no start time, so this is when it was last seen */
export type MacEntry = {
  id: string;
  kind: string;
  /** Last heartbeat in ms */
  lastSeen: number;
};

export type VersionState = {
  state: 'current' | 'behind' | 'unknown';
  /** What runs, as `sha-<7>`; null when unknown */
  runs: string | null;
  /** Main's newest build, as `sha-<7>`; null when unknown */
  main: string | null;
};

export type Versions = {
  /** The NUC image (container job) against agent-host-image.yml's newest build */
  image: VersionState;
  /** This desk's build against desk.yml's newest */
  desk: VersionState;
  /** The installed scripts against origin/main, as the Job line says */
  install: Job['install'] | null;
};

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
  limits: Limits;
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
  /** The NUC's image against main's newest image build; null when current or either side is unknown */
  imageBehind: Behind | null;
  /** This desk against main's newest desk build; null when current, a local build, or main's is unknown */
  deskBehind: Behind | null;
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
  /** The NUC block; null without a sample */
  nuc: NucBlock | null;
  /** The NUC's CPU over the last 24 hours with the runs; null without a sample */
  cpuDay: CpuDay | null;
  /** The Mac's sessions seen since local midnight, oldest first */
  macToday: MacEntry[];
  /** What runs against what main built */
  versions: Versions;
  /** The plan's two usage windows; null per window without a sample */
  plan: PlanUsage;
  /** What the hours cost, by hour and by role */
  burn: UsageBurn;
  /** The scheduler's runs since local midnight */
  runsToday: RunsToday;
  /** The last 24 hours of activity by who acted */
  activityBy: ActivityBy;
  /** Ticket id -> minutes since the newest gate event of each item waiting on you */
  waitAge: Map<string, number>;
  /** The agent's PRs as GitHub last told, newest first */
  agentPrs: AgentPr[];
  /** Live sessions per host, newest first */
  hostSessions: HostSessions[];
  /** The Mac's hand-back to the NUC */
  handBack: HandBack;
  /** The newest live event; null before any */
  pulse: Pulse | null;
  /** The newest event of each live table, newest first */
  feed: Pulse[];
  problems: Problem[];
  health: HealthCheck[];
};

export type RunsToday = {
  count: number;
  /** Median of finished runs, in ms; null without one */
  medianMs: number | null;
  failed: number;
};

export type ActivityBy = { agent: number; human: number };

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
  !/^(idle|paused|planned( [A-Z]+-\d+)?|launched|implemented|suggested( [A-Z]+-\d+)?|nothing|skip)$/.test(
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
  /** `stale`: the newest sample is older than `silentMin`, so the figures are history */
  verdict: 'ok' | 'bad' | 'stale';
  problems: HostProblem[];
  latest: HostMetricRow;
  /** Minutes since the newest sample */
  ageMin: number;
  /** Minutes between samples, as their spacing says */
  intervalMin: number;
  /** Minutes without a sample after which the host is silent: HOST_STALE_SAMPLES intervals */
  silentMin: number;
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
  if (share(latest.disk_free, latest.disk_total) < HOST_DISK_FREE_MIN)
    problems.push('disk');
  const ageMin = (now.getTime() - at(latest)) / 6e4;
  // Observed rather than assumed, so a NUC still on the old 10-minute sampler is not silent between samples
  const intervalMin = sampleMinutes(series);
  const silentMin = silentAfter(intervalMin);
  return {
    host: latest.host,
    verdict: ageMin > silentMin ? 'stale' : problems.length ? 'bad' : 'ok',
    problems,
    latest,
    ageMin,
    intervalMin,
    silentMin,
    figures,
    average,
    swapGrowing,
    series
  };
};

const DAY_MS = 864e5;

/** A sample's CPU: the 1-minute load per core, which can pass 1 */
const cpuOf = (r: HostMetricRow): number => share(r.load1, r.cores);

/** The NUC's newest sample as shares, with whether a run is open now; the verdict stays the host's */
export const nucBlock = (
  host: HostHealth,
  rows: readonly Run[],
  now: Date
): NucBlock => {
  const r = host.latest;
  const container = r.cgroup_mem_current !== null && r.cgroup_mem_max !== null;
  return {
    host: host.host,
    verdict: host.verdict,
    ageMin: host.ageMin,
    cpu: cpuOf(r),
    memory: container
      ? share(r.cgroup_mem_current ?? 0, r.cgroup_mem_max ?? 0)
      : share(r.mem_total - r.mem_available, r.mem_total),
    memorySource: container ? 'container' : 'host',
    disk: share(r.disk_total - r.disk_free, r.disk_total),
    busy: rows.some(
      (x) =>
        x.finished === null && now.getTime() - Date.parse(x.started) <= DAY_MS
    )
  };
};

/** The last 24 hours of the NUC's CPU, with the runs as bands behind it */
export const cpuDay = (
  series: readonly HostMetricRow[],
  rows: readonly Run[],
  now: Date
): CpuDay => {
  const to = now.getTime();
  const from = to - DAY_MS;
  const points = series
    .map((r) => ({ at: Date.parse(r.at), cpu: cpuOf(r) }))
    .filter((p) => p.at >= from && p.at <= to)
    .sort((a, b) => a.at - b.at);
  const bands = rows
    .flatMap((r): CpuBand[] => {
      const start = Date.parse(r.started);
      if (Number.isNaN(start)) return [];
      const stop = r.finished === null ? to : Date.parse(r.finished);
      const end = Number.isNaN(stop) ? to : stop;
      if (end < from || start > to) return [];
      return [
        {
          start: Math.max(start, from),
          end: Math.min(end, to),
          ticket: r.ticket || null
        }
      ];
    })
    .sort((a, b) => a.start - b.start);
  const bandAt = (at: number): CpuBand | undefined =>
    bands.find((b) => at >= b.start && at <= b.end);
  const meanOrNull = (xs: readonly number[]): number | null =>
    xs.length ? mean(xs) : null;
  const peak = points.reduce<(typeof points)[number] | null>(
    (a, b) => (a && a.cpu >= b.cpu ? a : b),
    null
  );
  return {
    from,
    to,
    points,
    bands,
    idle: meanOrNull(points.filter((p) => !bandAt(p.at)).map((p) => p.cpu)),
    inRuns: meanOrNull(points.filter((p) => bandAt(p.at)).map((p) => p.cpu)),
    peak: peak ? { ...peak, ticket: bandAt(peak.at)?.ticket ?? null } : null
  };
};

/**
 * The Mac's sessions seen since local midnight, oldest first. The Mac is the hand-back's
 * host, else any host but the NUC (the sampled host, else the one that launches implementing sessions).
 */
export const macToday = (
  rows: readonly SessionRow[] | null,
  nucHost: string | null,
  handBackHost: string | null,
  now: Date
): MacEntry[] => {
  const all = rows ?? [];
  const nuc = nucHost ?? all.find((r) => r.kind === 'implement')?.host ?? null;
  const mac = handBackHost ?? all.find((r) => r.host !== nuc)?.host ?? null;
  if (!mac) return [];
  const midnight = new Date(now.getTime());
  midnight.setHours(0, 0, 0, 0);
  return all
    .filter((r) => r.host === mac)
    .map((r) => ({ id: r.id, kind: r.kind, lastSeen: Date.parse(r.last_seen) }))
    .filter((e) => e.lastSeen >= midnight.getTime())
    .sort((a, b) => a.lastSeen - b.lastSeen);
};

const sha7 = (sha: string): string => sha.replace(/^sha-/, '').slice(0, 7);

const versionState = (
  runs: string | null,
  main: string | null
): VersionState => ({
  state:
    runs && main
      ? sha7(runs) === sha7(main)
        ? 'current'
        : 'behind'
      : 'unknown',
  runs,
  main
});

/** The image, the desk and the scripts against what main built; `unknown` when either side is */
export const versions = (
  job: Job | null,
  main: RunsPayload['main'] | null,
  desk: string | null
): Versions => ({
  image: versionState(
    job?.host === 'container' && job.rev ? job.rev : null,
    main?.image ? 'sha-' + main.image.slice(0, 7) : null
  ),
  desk: versionState(
    desk ? 'sha-' + desk.slice(0, 7) : null,
    main?.desk ? 'sha-' + main.desk.slice(0, 7) : null
  ),
  install: job?.install ?? null
});

export type PlanKind = keyof typeof PLAN_WINDOW_H;

/** A window whose reset has passed carries no usage: the next sample starts the new one */
export type PlanWindow =
  | { kind: PlanKind; reset: true; resetsAt: Date }
  | {
      kind: PlanKind;
      reset: false;
      resetsAt: Date;
      /** The window's start: its reset minus PLAN_WINDOW_H */
      start: Date;
      /** Percent used at the newest sample */
      used: number;
      sampledAt: Date;
      /** Percent per hour since the window started */
      rate: number;
      /** Percent at the reset if the rate holds, from the newest sample */
      projected: number;
      /** When the rate uses the plan up; null when it does not before the reset */
      runsOutAt: Date | null;
      /** Minutes since the newest sample */
      ageMin: number;
      /** `stale`: older than PLAN_STALE_MIN, so the figure is history */
      stale: boolean;
      verdict: 'ok' | 'warn' | 'bad';
    };

export type PlanUsage = Record<PlanKind, PlanWindow | null>;

const planWindow = (
  kind: PlanKind,
  rows: readonly PlanUsageRow[],
  now: Date
): PlanWindow | null => {
  const ofKind = rows.filter((r) => r.kind === kind);
  if (!ofKind.length) return null;
  const resetsMs = Math.max(...ofKind.map((r) => Date.parse(r.resets_at)));
  const resetsAt = new Date(resetsMs);
  if (resetsMs <= now.getTime()) return { kind, reset: true, resetsAt };
  // A reset time that drifts a little between samples is still the same window
  const latest = ofKind
    .filter((r) => resetsMs - Date.parse(r.resets_at) < PLAN_RESET_DRIFT_MS)
    .reduce((a, b) =>
      Date.parse(a.sampled_at) >= Date.parse(b.sampled_at) ? a : b
    );
  const sampledMs = Date.parse(latest.sampled_at);
  const startMs = resetsMs - PLAN_WINDOW_H[kind] * 36e5;
  const used = latest.used_percentage;
  const elapsedH = Math.max(0.1, (sampledMs - startMs) / 36e5);
  const rate = used / elapsedH;
  const projected = used + rate * Math.max(0, (resetsMs - sampledMs) / 36e5);
  const ageMin = (now.getTime() - sampledMs) / 6e4;
  // Too early in the window the rate says little, so no projection counts yet
  const early =
    sampledMs - startMs < PLAN_PROJECT_AFTER * PLAN_WINDOW_H[kind] * 36e5;
  return {
    kind,
    reset: false,
    resetsAt,
    start: new Date(startMs),
    used,
    sampledAt: new Date(sampledMs),
    rate,
    projected,
    runsOutAt:
      !early && rate > 0 && projected >= 100
        ? new Date(startMs + (100 / rate) * 36e5)
        : null,
    ageMin,
    stale: ageMin > PLAN_STALE_MIN,
    verdict:
      used >= 100 ? 'bad' : !early && projected >= PLAN_WARN_PCT ? 'warn' : 'ok'
  };
};

/** Each window as the newest sample of its newest reset time says, with a straight-line projection to the reset */
export const planUsage = (
  rows: readonly PlanUsageRow[] | null,
  now: Date
): PlanUsage => ({
  five_hour: planWindow('five_hour', rows ?? [], now),
  seven_day: planWindow('seven_day', rows ?? [], now)
});

export const BURN_ROLES = [...ROLES, 'other'] as const;
export type BurnRole = (typeof BURN_ROLES)[number];

export type BurnTotals = Record<BurnRole, number> & { total: number };

export type UsageBurn = {
  /** Dollars per hour over every host, the last 24 hours, oldest first and zero-filled; `hour` is the hour's start in ms */
  hourly: { hour: number; cost: number }[];
  /** Dollars per role since the five-hour window started, or the last 5 hours without one */
  fiveHour: BurnTotals;
  /** Dollars per role over the last 7 days */
  sevenDay: BurnTotals;
};

const HOUR_MS = 36e5;

const totalsSince = (
  rows: readonly UsageHourRow[],
  since: number
): BurnTotals => {
  const totals: BurnTotals = {
    planning: 0,
    orchestrating: 0,
    implementing: 0,
    other: 0,
    total: 0
  };
  for (const r of rows) {
    // An hour row counts when any of its hour falls inside
    if (Date.parse(r.hour) + HOUR_MS <= since) continue;
    const role = BURN_ROLES.find((x) => x === r.role) ?? 'other';
    totals[role] += r.cost_usd;
    totals.total += r.cost_usd;
  }
  return totals;
};

/** API-equivalent dollars from the hourly rows: a bucket per hour for the last 24, role totals for the plan's windows */
export const usageBurn = (
  rows: readonly UsageHourRow[] | null,
  now: Date,
  fiveHour: PlanWindow | null = null
): UsageBurn => {
  const all = rows ?? [];
  const nowMs = now.getTime();
  const thisHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    hour: thisHour - (23 - i) * HOUR_MS,
    cost: 0
  }));
  for (const r of all) {
    const bucket = hourly.find((b) => b.hour === Date.parse(r.hour));
    if (bucket) bucket.cost += r.cost_usd;
  }
  const windowStart =
    fiveHour && !fiveHour.reset
      ? fiveHour.start.getTime()
      : nowMs - 5 * HOUR_MS;
  return {
    hourly,
    fiveHour: totalsSince(all, windowStart),
    sevenDay: totalsSince(all, nowMs - 7 * 24 * HOUR_MS)
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

/** Runs since local midnight: how many, their median duration, and how many failed */
export const runsToday = (rows: readonly Run[], now: Date): RunsToday => {
  const midnight = new Date(now.getTime());
  midnight.setHours(0, 0, 0, 0);
  const today = rows.filter((r) => Date.parse(r.started) >= midnight.getTime());
  const durations = today
    .filter((r) => r.finished)
    .map((r) => Date.parse(r.finished ?? '') - Date.parse(r.started))
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  return {
    count: today.length,
    medianMs: durations.length
      ? durations.length % 2
        ? durations[mid]
        : (durations[mid - 1] + durations[mid]) / 2
      : null,
    failed: today.filter((r) => isProblem(r.outcome)).length
  };
};

/** The last 24 hours of activity: the agent and the scheduler against everyone else */
export const activityBy = (
  activity: ActivityPayload | null,
  now: Date
): ActivityBy => {
  const day = (activity?.rows ?? []).filter(
    (r) => now.getTime() - runTime(r.when) <= 864e5
  );
  const agent = day.filter(
    (r) => r.actor === 'agent' || r.actor === 'scheduler'
  ).length;
  return { agent, human: day.length - agent };
};

// What opens a wait on Håkan, as `cdwr agent activity` words it: a gate label added, or a gate comment
const GATE =
  /\+agent:(needs-input|review)\b|^comment: \*\*Agent(: plan ready| needs input|: PR ready|: review addressed)/;

/** Minutes since each ticket's newest gate event, else its newest event; tickets without activity are left out */
export const waitAges = (
  tickets: readonly string[],
  activity: ActivityPayload | null,
  now: Date
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const id of tickets) {
    const rows = (activity?.rows ?? []).filter((r) => r.ticket === id);
    // The rows are newest first
    const row = rows.find((r) => GATE.test(r.change)) ?? rows[0];
    if (row) out.set(id, (now.getTime() - runTime(row.when)) / 6e4);
  }
  return out;
};

/** PR number -> ticket, for every ticket the queue view names with a PR, as `prOf` resolves it */
export const ticketsByPr = (
  details: ReadonlyMap<string, Detail>,
  entries: readonly { ticket: string; pr?: PrRef | null }[]
): Map<number, string> => {
  const out = new Map<number, string>();
  for (const x of entries) {
    const pr = Number(prOf(details, x.ticket, x.pr));
    if (Number.isInteger(pr) && pr > 0 && !out.has(pr)) out.set(pr, x.ticket);
  }
  return out;
};

export const model = (
  state: DeskState,
  now: Date,
  desk: string | null = deskSha()
): Model => {
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

  const limit = v ? v.limit : { used: 0, max: LIMIT };
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

  const vers = versions(runs?.job ?? null, runs?.main ?? null, desk);
  const behind = (x: VersionState): Behind | null =>
    x.state === 'behind' && x.runs && x.main
      ? { runs: x.runs, main: x.main }
      : null;
  const imageBehind = behind(vers.image);
  const deskBehind = behind(vers.desk);
  const effort = runs?.job?.effort ?? null;
  const plan = planUsage(data.planUsage, now);
  const host = hostHealth(data.hostMetrics, now);
  const sessions = hostSessions(data.sessions, now);
  const nucSession = sessions.find((s) => s.host === host?.host);
  const nucFresh =
    (host !== null && host.ageMin <= host.silentMin) ||
    (nucSession !== undefined && nucSession.ageMin <= (host?.silentMin ?? 0));
  const hand = handBack(data.sessions, host?.host ?? null, nucFresh, now);
  const prTickets = ticketsByPr(details, [
    ...after,
    ...(v ? v.parked : []),
    ...(v ? v.next : []),
    ...before,
    ...toLabel
  ]);
  const nucView = host
    ? {
        host: host.host,
        at: Date.parse(host.latest.at),
        ageMin: host.ageMin,
        silentMin: host.silentMin
      }
    : null;
  const found = problems({
    connection: data.connection,
    runs,
    runMinutes,
    host: nucView,
    sessions: data.sessions,
    now
  });
  const checks = health({
    connection: data.connection,
    runs,
    staleHours,
    nuc: nucView,
    heartbeats: hostHeartbeats(data.sessions, host?.host ?? null, now),
    events: data.githubEvents,
    storedAt: data.storedAt,
    now
  });

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
    limit,
    limits: {
      prs: limit,
      effort: effort
        ? { ...effort, share: share(effort.spent, effort.cap) }
        : null,
      paused: runs?.job?.paused ?? false
    },
    slots: [...slots.values()],
    session,
    stuck,
    runProblems,
    lastRunAge,
    staleHours,
    schedulerStale: lastRunAge === null || lastRunAge > staleHours,
    installStale: runs?.job?.install === 'stale',
    imageBehind,
    deskBehind,
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
    host,
    nuc: host ? nucBlock(host, rows, now) : null,
    cpuDay: host ? cpuDay(host.series, rows, now) : null,
    macToday: macToday(data.sessions, host?.host ?? null, hand.host, now),
    versions: vers,
    plan,
    burn: usageBurn(data.usageHours, now, plan.five_hour),
    runsToday: runsToday(rows, now),
    activityBy: activityBy(activity, now),
    waitAge: waitAges(
      [
        ...before.map((x) => x.ticket),
        ...toLabel.map((x) => x.ticket),
        ...handoffs.map((x) => x.ticket),
        ...prs.map((x) => x.ticket)
      ],
      activity,
      now
    ),
    agentPrs: agentPrs(data.githubEvents, prTickets, (id) => get(id).title),
    hostSessions: sessions,
    handBack: hand,
    pulse: pulse(data.githubEvents, data.connection),
    feed: feed(data.githubEvents, data.connection),
    problems: [...found, ...(runs ? checkProblems(checks, found) : [])],
    health: checks
  };
};
