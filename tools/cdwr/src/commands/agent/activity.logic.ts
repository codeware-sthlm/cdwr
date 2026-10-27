import { localMinute } from './usage.logic';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Named = { name?: string | null } | null | undefined;

export type BotActor =
  { name?: string | null; type?: string | null } | null | undefined;

export interface HistoryNode {
  id?: string | null;
  createdAt: string;
  actor?: Named;
  botActor?: BotActor;
  fromState?: Named;
  toState?: Named;
  addedLabels?: Named[] | null;
  removedLabels?: Named[] | null;
  updatedDescription?: boolean | null;
}

export interface CommentNode {
  id?: string | null;
  createdAt: string;
  body?: string | null;
  user?: Named;
  botActor?: BotActor;
}

export interface IssueNode {
  identifier: string;
  history?: { nodes?: HistoryNode[] | null } | null;
  comments?: { nodes?: CommentNode[] | null } | null;
}

/** Response of the issues query run.sh sends: history and comments, 50 of each per issue */
export interface LinearActivityResponse {
  data?: { issues?: { nodes?: IssueNode[] | null } | null } | null;
}

/** One line of runs.jsonl; `when` is local `YYYY-MM-DD HH:MM` */
export interface RunRow {
  when: string;
  outcome: string;
  ticket: string;
  detail: string;
}

export interface ActivityEvent {
  /** Stable across edits: Linear's own id where it has one, else derived from the kind, ticket and time */
  id: string;
  at: Date;
  ticket: string;
  actor: string;
  change: string;
}

const COMMENT_LENGTH = 80;

/**
 * Who did it. The agent and Håkan write through one Linear account, so a
 * comment marked `**Agent` is the only sign of the agent; a bot actor is named
 * by its name, else its type.
 */
export const actorOf = ({
  body,
  user,
  actor,
  botActor
}: {
  body?: string | null;
  user?: Named;
  actor?: Named;
  botActor?: BotActor;
}): string => {
  if (body?.trim().startsWith('**Agent')) return 'agent';
  const bot = botActor?.name ?? botActor?.type;
  if (bot) return bot;
  return user?.name ?? actor?.name ?? 'unknown';
};

const names = (labels: Named[] | null | undefined): string[] =>
  (labels ?? []).flatMap((label) => (label?.name ? [label.name] : []));

/** One event per history node that moved the status, changed labels or edited the description */
export const historyEvents = (issue: IssueNode): ActivityEvent[] =>
  (issue.history?.nodes ?? []).flatMap((node) => {
    const parts: string[] = [];
    const to = node.toState?.name;
    if (to) {
      const from = node.fromState?.name;
      parts.push(from ? `status ${from} → ${to}` : `status → ${to}`);
    }
    const labels = [
      ...names(node.addedLabels).map((n) => `+${n}`),
      ...names(node.removedLabels).map((n) => `−${n}`)
    ];
    if (labels.length > 0) parts.push(labels.join(' '));
    if (node.updatedDescription === true) parts.push('description edited');
    if (parts.length === 0) return [];
    return [
      {
        id: node.id
          ? `history:${node.id}`
          : `history:${issue.identifier}:${node.createdAt}`,
        at: new Date(node.createdAt),
        ticket: issue.identifier,
        actor: actorOf(node),
        change: parts.join(', ')
      }
    ];
  });

const firstLine = (body: string | null | undefined): string => {
  const line =
    (body ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  return line.length > COMMENT_LENGTH
    ? `${line.slice(0, COMMENT_LENGTH)}…`
    : line;
};

/** One event per comment, as its first line */
export const commentEvents = (issue: IssueNode): ActivityEvent[] =>
  (issue.comments?.nodes ?? []).map((node) => ({
    id: node.id
      ? `comment:${node.id}`
      : `comment:${issue.identifier}:${node.createdAt}`,
    at: new Date(node.createdAt),
    ticket: issue.identifier,
    actor: actorOf(node),
    change: `comment: ${firstLine(node.body)}`
  }));

/** The scheduler's own runs; `when` is local time and rows with an unreadable one are skipped */
export const runEvents = (rows: RunRow[]): ActivityEvent[] =>
  rows.flatMap((row) => {
    const at = new Date(row.when.replace(' ', 'T'));
    if (Number.isNaN(at.getTime())) return [];
    const change = `run: ${row.outcome}${row.detail === '' ? '' : ` — ${row.detail}`}`;
    const ticket = row.ticket === '' ? '—' : row.ticket;
    return [
      {
        // A runs row never changes once written, so its own text is a stable key
        id: `run:${at.toISOString()}:${ticket}:${change}`,
        at,
        ticket,
        actor: 'scheduler',
        change
      }
    ];
  });

/** Everything in the window, newest first, at most `limit`; `dropped` counts what the cap cut */
export const collectEvents = (
  response: LinearActivityResponse,
  rows: RunRow[],
  { now, windowDays, limit }: { now: Date; windowDays: number; limit: number }
): { events: ActivityEvent[]; dropped: number } => {
  const since = now.getTime() - windowDays * DAY_MS;
  const issues = response.data?.issues?.nodes ?? [];
  const inWindow = [
    ...issues.flatMap((issue) => [
      ...historyEvents(issue),
      ...commentEvents(issue)
    ]),
    ...runEvents(rows)
  ]
    .filter((e) => e.at.getTime() >= since)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    events: inWindow.slice(0, limit),
    dropped: Math.max(0, inWindow.length - limit)
  };
};

/** One row of the telemetry `activity` table */
export interface ActivityRow {
  event_id: string;
  at: string;
  ticket: string | null;
  actor: 'agent' | 'scheduler' | 'human';
  change: string;
}

/** The table keeps three kinds of actor: the agent, the scheduler and everyone else */
const actorKind = (actor: string): ActivityRow['actor'] =>
  actor === 'agent' || actor === 'scheduler' ? actor : 'human';

/** The same events as the document, shaped for the `activity` table; the scheduler's `—` ticket is none */
export const activityRows = (events: ActivityEvent[]): ActivityRow[] => {
  // One row per id: a merge upsert refuses to touch the same row twice in a batch
  const byId = new Map<string, ActivityRow>();
  for (const e of events) {
    byId.set(e.id, {
      event_id: e.id,
      at: e.at.toISOString(),
      ticket: e.ticket === '—' ? null : e.ticket,
      actor: actorKind(e.actor),
      change: e.change
    });
  }
  return [...byId.values()];
};

/** Backslash first, so a cell ending in `\` can't swallow the delimiter after it */
/** `1 event`, `2 events` */
export const plural = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? '' : 's'}`;

const cell = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The "Agent queue: activity" Linear document. The Agent Desk parses it, so the
 * first line, the table header and the column order are a contract: change
 * both together.
 */
export const renderActivityDocument = (
  events: ActivityEvent[],
  {
    updated,
    windowDays,
    dropped
  }: { updated: string; windowDays: number; dropped: number }
): string => {
  const head = ['When', 'Ticket', 'Actor', 'Change'];
  const table = [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '--').join(' | ')} |`,
    ...events.map(
      (e) =>
        `| ${[localMinute(e.at), e.ticket, e.actor, e.change].map(cell).join(' | ')} |`
    )
  ].join('\n');

  return [
    `Updated: ${updated} · last ${plural(windowDays, 'day')} · ${plural(events.length, 'event')}`,
    'Written by the agent queue scheduler from Linear\'s issue history and its own runs. Times are local. Actor "agent" is a comment marked `**Agent`; the agent and Håkan otherwise write through the same Linear account.',
    ...(dropped > 0
      ? [
          `Older events beyond the newest ${events.length} are left out (${dropped}).`
        ]
      : []),
    table
  ].join('\n\n');
};
