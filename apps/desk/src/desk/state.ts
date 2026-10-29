import type { DataFailure } from '../data';
import type { Issue, OpenStatusType } from '../linear';
import type {
  ActivityPayload,
  HostMetricRow,
  RunsPayload,
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
  'after',
  'session',
  'limit',
  'scheduler',
  'timers',
  'nuc',
  'activity',
  'shipped',
  'spend',
  'ticketcost',
  'all',
  'ideas'
] as const;

export type SheetId = (typeof SHEET_IDS)[number];

export const isSheetId = (value: unknown): value is SheetId =>
  SHEET_IDS.some((id) => id === value);

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
  /** When the open tickets were last stored, in ms */
  storedAt: number | null;
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
    storedAt: null
  },
  details: new Map(),
  liveHandoffs: new Map(),
  ideaReasons: new Map(),
  errors: new Map(),
  ui: { filter: 'all', actFilter: 'all', openSheet: null }
});
