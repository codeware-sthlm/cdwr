import type { DataFailure } from '../data';
import type { Issue, OpenStatusType } from '../linear';
import type {
  ActivityPayload,
  GithubEventRow,
  HostMetricRow,
  IssueEventRow,
  PlanUsageRow,
  RunsPayload,
  SessionRow,
  UsageHourRow,
  UsagePayload
} from '../supabase';

import { STATES } from './constants';
import type { Idea, PlanProgress } from './types';

/** What the page keeps of a ticket's description and relations */
export type Detail = PlanProgress & {
  idea: Idea | null;
  blockedBy: string[];
  pr: number | null;
};

export type Filter = 'all' | 'todo' | 'agent';

export const isFilter = (value: unknown): value is Filter =>
  value === 'all' || value === 'todo' || value === 'agent';

/** The sheets, one per column, gauge and tile; also what `data-w` and the URL hash name */
export const SHEET_IDS = [
  'before',
  'next',
  'review',
  'handoffs',
  'session',
  'limit',
  'scheduler',
  'runs',
  'timers',
  'nuc',
  'plan',
  'activity',
  'shipped',
  'effort',
  'all',
  'ideas'
] as const;

export type SheetId = (typeof SHEET_IDS)[number];

export const isSheetId = (value: unknown): value is SheetId =>
  SHEET_IDS.some((id) => id === value);

/** Sheet ids an older saved link may still carry, and the sheet that took their place */
export const OLD_SHEET_IDS: ReadonlyMap<string, SheetId> = new Map([
  ['after', 'review'],
  ['spend', 'effort'],
  ['ticketcost', 'effort']
]);

/** A current sheet id, or the sheet an old id moved to; null for anything else */
export const sheetIdOf = (value: unknown): SheetId | null =>
  isSheetId(value)
    ? value
    : typeof value === 'string'
      ? (OLD_SHEET_IDS.get(value) ?? null)
      : null;

/** What the sources have delivered; null until they have */
export type DeskData = {
  /** State type -> issues */
  buckets: Map<OpenStatusType, Issue[]>;
  /** Agent tickets completed in the last 30 days */
  closed: Issue[] | null;
  /** agent-idea tickets updated in the last 60 days, every state */
  ideas: Issue[] | null;
  runs: RunsPayload | null;
  usage: UsagePayload | null;
  activity: ActivityPayload | null;
  /** The host's samples of the last 24 hours, oldest first */
  hostMetrics: HostMetricRow[] | null;
  /** The plan's usage samples of the last 8 days */
  planUsage: PlanUsageRow[] | null;
  /** The hourly usage rows of the last 8 days */
  usageHours: UsageHourRow[] | null;
  /** One row per PR or branch, newest first */
  githubEvents: GithubEventRow[] | null;
  /** The sessions seen in the last 24 hours, newest first */
  sessions: SessionRow[] | null;
  /** The Realtime channel as the adapter reports it */
  connection: Connection;
  /** When the open tickets were last stored, in ms */
  storedAt: number | null;
};

/** The Realtime channel: whether it is joined, how often it dropped, since when it is up, and the newest issue event it brought */
export type Connection = {
  live: boolean;
  retries: number;
  upSince: number | null;
  lastIssue: IssueEventRow | null;
};

/** What the viewer has chosen */
export type DeskUi = {
  /** The Open tickets sheet's filter */
  filter: Filter;
  /** The Activity sheet's ticket filter, `all` or a ticket id */
  actFilter: string;
  openSheet: SheetId | null;
};

export type DeskState = {
  data: DeskData;
  /** Ticket id -> plan progress, idea, blockers and PR */
  details: Map<string, Detail>;
  /** Ticket id -> unticked hand-off items read from the ticket's comments, ahead of the queue view */
  liveHandoffs: Map<string, string[]>;
  /** Idea id -> the discard word: the cancelled ticket's last comment */
  ideaReasons: Map<string, string>;
  /** Source -> its latest error */
  errors: Map<string, DataFailure>;
  ui: DeskUi;
};

/** Whether any of the ticket lists has arrived */
export const bucketsLoaded = (data: DeskData): boolean =>
  STATES.some((s) => data.buckets.has(s));

export const createState = (): DeskState => ({
  data: {
    buckets: new Map(),
    closed: null,
    ideas: null,
    runs: null,
    usage: null,
    activity: null,
    hostMetrics: null,
    planUsage: null,
    usageHours: null,
    githubEvents: null,
    sessions: null,
    connection: { live: false, retries: 0, upSince: null, lastIssue: null },
    storedAt: null
  },
  details: new Map(),
  liveHandoffs: new Map(),
  ideaReasons: new Map(),
  errors: new Map(),
  ui: { filter: 'all', actFilter: 'all', openSheet: null }
});
