import type { DataFailure } from '../data';
import type { Issue, OpenStatusType } from '../linear';
import type {
  ActivityPayload,
  ChannelStatus,
  DeskCommandRow,
  GithubEventRow,
  HostMetricRow,
  IssueEventRow,
  PlanUsageRow,
  RunsPayload,
  SessionRow,
  SnoozeRow,
  UsageHourRow,
  UsagePayload
} from '../supabase';

import type {
  CommandArgs,
  CommandReply,
  CommandTarget,
  Control,
  ControlKind
} from './commands';
import { STATES } from './constants';
import type { Idea, PlanProgress } from './types';

/** What the page keeps of a ticket's description and relations */
export type Detail = PlanProgress & {
  idea: Idea | null;
  blockedBy: string[];
  pr: number | null;
  /** When Linear last synced that PR's attachment, in ms; the evidence of GitHub activity the webhook check compares with */
  prAt: number | null;
};

export type Filter = 'all' | 'todo' | 'agent';

export const isFilter = (value: unknown): value is Filter =>
  value === 'all' || value === 'todo' || value === 'agent';

/** The sheets, one per column, gauge and tile; also what `data-w` and the URL hash name */
export const SHEET_IDS = [
  'before',
  'next',
  'tree',
  'review',
  'handoffs',
  'session',
  'limit',
  'scheduler',
  'runs',
  'timers',
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

/** The full-page views; the desk is the default and has no hash */
export type View = 'desk' | 'platform';

/** The view a URL hash names: `platform`, or `nuc` from older links; null for anything else */
export const viewOf = (value: unknown): 'platform' | null =>
  value === 'platform' || value === 'nuc' ? 'platform' : null;

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
  /** The desk commands of the last 24 hours, oldest first */
  deskCommands: DeskCommandRow[] | null;
  /** Every snoozed ticket, by ticket */
  snoozes: SnoozeRow[] | null;
  /** The Realtime channel as the adapter reports it */
  connection: Connection;
  /** When the open tickets were last stored, in ms */
  storedAt: number | null;
};

/** The Realtime channel: whether it is joined, how often it dropped, since when it is up or down, its last status, when the next retry fires, and the newest issue event it brought */
export type Connection = {
  live: boolean;
  retries: number;
  upSince: number | null;
  /** When the channel went (or started) down, in ms; null while it is up */
  downSince: number | null;
  /** The last status the channel reported; null before any */
  status: ChannelStatus | null;
  /** When the backoff timer fires next, in ms; null with none pending */
  nextAt: number | null;
  lastIssue: IssueEventRow | null;
};

/** What the viewer has chosen */
export type DeskUi = {
  /** The Open tickets sheet's filter */
  filter: Filter;
  /** The Activity sheet's ticket filter, `all` or a ticket id */
  actFilter: string;
  openSheet: SheetId | null;
  /** The full-page view shown in place of the desk */
  view: View;
  /** The Snoozed fold is open, kept so a render doesn't close it */
  snoozedOpen: boolean;
};

/** The desk's own side of the controls */
export type ControlsUi = {
  /** Where commands go; null without a control token, which hides the controls */
  target: CommandTarget | null;
  /** Stepper values not yet applied */
  drafts: Partial<Record<'limit' | 'cap', number>>;
  /** Controls whose request is in flight */
  sending: Set<Control>;
  /** A failure that stored no row (network, token), shown until the control is used again */
  failed: Map<Control, { kind: ControlKind; note: string }>;
  /** The function's reply to each control's last command, standing in for its row until that arrives; `at` in ms */
  awaiting: Map<
    Control,
    CommandReply & {
      host: string;
      kind: ControlKind;
      args: CommandArgs;
      at: number;
    }
  >;
  /** The abandon button asks for confirmation until `until` (ms), for the session it showed */
  confirm: { until: number; session: string | null } | null;
  /** Tickets whose snooze or wake request is in flight */
  snoozing: Set<string>;
  /** Ticket -> why its last snooze or wake did not go through, shown until it is used again */
  snoozeNotes: Map<string, string>;
  /** Ticket -> when its Label button asked for confirmation, in ms */
  labelConfirm: Map<string, number>;
  /** Tickets whose label request is in flight */
  labelling: Set<string>;
  /** Ticket -> when it was labelled, in ms */
  labelled: Map<string, number>;
  /** Ticket -> why its last label request failed, shown until it is used again */
  labelNotes: Map<string, string>;
  /** Ticket -> when its Merge button asked for confirmation, in ms */
  mergeConfirm: Map<string, number>;
  /** `prCommandKey`s whose Copilot or Merge request is in flight */
  prSending: Set<string>;
  /** `prCommandKey` -> why its last request failed or was refused, shown until it is used again */
  prNotes: Map<string, string>;
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
  controls: ControlsUi;
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
    deskCommands: null,
    snoozes: null,
    connection: {
      live: false,
      retries: 0,
      upSince: null,
      downSince: null,
      status: null,
      nextAt: null,
      lastIssue: null
    },
    storedAt: null
  },
  details: new Map(),
  liveHandoffs: new Map(),
  ideaReasons: new Map(),
  errors: new Map(),
  ui: {
    filter: 'all',
    actFilter: 'all',
    openSheet: null,
    view: 'desk',
    snoozedOpen: false
  },
  controls: emptyControls(null)
});

/** The controls with nothing in flight, aimed at `target` (null: the controls are off) */
export const emptyControls = (target: ControlsUi['target']): ControlsUi => ({
  target,
  drafts: {},
  sending: new Set(),
  failed: new Map(),
  awaiting: new Map(),
  confirm: null,
  snoozing: new Set(),
  snoozeNotes: new Map(),
  labelConfirm: new Map(),
  labelling: new Set(),
  labelled: new Map(),
  labelNotes: new Map(),
  mergeConfirm: new Map(),
  prSending: new Set(),
  prNotes: new Map()
});
