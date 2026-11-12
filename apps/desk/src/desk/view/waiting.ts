import type { SnoozeRow } from '../../supabase';
import { PENDING_MAX_MS, type PrCommandState } from '../commands';
import { CONFIRM_MS } from '../constants';
import { type Blocker, type Model, type WatchRef, prOf } from '../model';
import type { ControlsUi, Detail } from '../state';
import type { PrRef, WatchEntry } from '../types';

import { prWaitPlain } from './parked';
import { queuePr } from './pr';

// The Waiting on you card: everything that waits on you, furthest along first, each with how long it has waited

/** Rows the phone shows before "+ n more — open all" */
export const PHONE_ROWS = 2;
/** Rows the desktop shows before "+ n more — open all" */
export const DESKTOP_ROWS = 4;

export type WaitRow = {
  id: string;
  title: string;
  url: string;
  kind:
    | 'review'
    | 'hand-offs'
    | 'question'
    | 'plan'
    | 'ready to label'
    | 'idea'
    | 'approved';
  /** The ticket's pull request; null without one, and always for an idea */
  pr: PrRef | null;
  /** Minutes waited; null without activity to tell */
  age: number | null;
  /** Open hand-off items; null for any other kind */
  count: number | null;
  /** The open blockers as "COD-693 · PR 755, COD-700"; empty when none */
  blockers: string;
  /** Plain-text note on a PR parked on review fixes; empty otherwise */
  wait: string;
  /** ISO time of the activity event the wait counts from; null without activity */
  gateAt: string | null;
  /** Snoozed until something changes; such a row leaves every count */
  snoozed: boolean;
};

/**
 * Whether a snooze still holds for a row. It holds while the row has the kind it was snoozed
 * in and no newer gate event has come since; a row the snooze no longer holds for is awake
 * again, and the stale snooze row is simply ignored until a new snooze overwrites it.
 */
export const isSnoozed = (
  row: { id: string; kind: WaitRow['kind'] },
  gateAt: string | null,
  snoozes: readonly SnoozeRow[]
): boolean => {
  const snooze = snoozes.find((s) => s.ticket === row.id);
  if (!snooze || snooze.kind !== row.kind) return false;
  if (gateAt === null) return true;
  return (
    snooze.event_at !== null &&
    Date.parse(gateAt) <= Date.parse(snooze.event_at)
  );
};

/** What the snooze buttons need: whether the controls are on, the tickets in flight and the notes to show */
export type SnoozeUi = {
  on: boolean;
  busy: ReadonlySet<string>;
  notes: ReadonlyMap<string, string>;
  label: LabelUi;
  pr: PrUi;
};

/** What the Copilot and Merge buttons need: what the hosts watch and the commands sent, and the viewer's side of the controls */
export type PrUi = {
  watch: ReadonlyMap<string, WatchRef>;
  commands: ReadonlyMap<string, PrCommandState>;
  controls: Pick<ControlsUi, 'mergeConfirm' | 'prSending' | 'prNotes'>;
};

/** What the Label buttons need: the viewer's side of the controls */
export type LabelUi = Pick<
  ControlsUi,
  'labelConfirm' | 'labelling' | 'labelled' | 'labelNotes'
>;

export type LabelState =
  'idle' | 'confirming' | 'labelling' | 'labelled' | { note: string };

/** The snooze buttons' state from the model and the viewer's side of the controls */
export const snoozeUi = (m: Model, c: ControlsUi): SnoozeUi => ({
  on: m.controls !== null,
  busy: c.snoozing,
  notes: c.snoozeNotes,
  label: c,
  pr: { watch: m.watch, commands: m.prCommands, controls: c }
});

/** Where a ticket's Label button stands: asking to confirm, in flight, done for a while, or refused with a note */
export const labelState = (
  ticket: string,
  ui: LabelUi,
  now: number,
  gateAt: string | null = null
): LabelState => {
  if (ui.labelling.has(ticket)) return 'labelling';
  const labelled = ui.labelled.get(ticket);
  // Labelled from here, until the queue drops the row; a row whose gate moved on since came
  // back as ready to label and is live again
  if (
    labelled !== undefined &&
    now - labelled <= PENDING_MAX_MS &&
    (gateAt === null || Date.parse(gateAt) <= labelled)
  )
    return 'labelled';
  const note = ui.labelNotes.get(ticket);
  if (note) return { note };
  const asked = ui.labelConfirm.get(ticket);
  return asked !== undefined && now - asked < CONFIRM_MS
    ? 'confirming'
    : 'idle';
};

/**
 * Forgets the labels this desk sent for tickets a loaded queue view no longer lists as ready to
 * label: the queue took them, and a ticket that comes back starts fresh
 */
export const forgetLabelled = (
  labelled: Map<string, number>,
  toLabel: readonly { ticket: string }[] | null
): void => {
  if (toLabel === null) return;
  const listed = new Set(toLabel.map((x) => x.ticket));
  for (const ticket of [...labelled.keys()])
    if (!listed.has(ticket)) labelled.delete(ticket);
};

/** Why the scheduler would refuse to merge the PR, in its words (watch.jq `desk_verdict`); null when it would not */
export const mergeBlocker = (e: WatchEntry): string | null => {
  if (e.state === 'merged' || e.state === 'closed') return `PR is ${e.state}`;
  if (e.draft) return 'PR is a draft';
  if (e.state === 'queued') return 'already in the merge queue';
  if (e.conflicting === true || e.state === 'conflicting')
    return 'conflicts with main';
  if (e.conflicting === null || e.mergeable === 'UNKNOWN')
    return 'GitHub has not checked for conflicts yet';
  if (e.ci === null || e.threads === null) return 'no check data yet';
  if (e.ci !== 'SUCCESS') return `checks ${e.ci.toLowerCase()}`;
  if (e.threads > 0)
    return `${e.threads} unresolved ${e.threads === 1 ? 'thread' : 'threads'}`;
  return null;
};

/** What the entry says of Copilot's review: the button to ask for one, a note on where it stands, or null when the entry does not say */
export const copilotView = (
  e: WatchEntry
): 'button' | { note: string } | null =>
  e.copilot === null
    ? null
    : e.copilot === 'none'
      ? 'button'
      : {
          note: e.copilot === 'requested' ? 'Copilot asked' : 'Copilot reviewed'
        };

/** Why the last request for a key failed or was refused: the desk's own note, else the refused row's; empty when neither */
export const whyNot = (
  key: string,
  ui: PrUi,
  sent: PrCommandState | undefined
): string =>
  ui.controls.prNotes.get(key) ?? (sent?.state === 'refused' ? sent.note : '');

/** True while the command was applied and no watch snapshot newer than that has arrived to say what became of it */
export const awaitsWatch = (
  sent: PrCommandState | undefined,
  entry: WatchEntry
): boolean =>
  sent?.state === 'applied' &&
  !(
    sent.at !== null &&
    entry.at !== null &&
    Date.parse(entry.at) > Date.parse(sent.at)
  );

/** Open blockers as text: the ticket, with its PR when it has one */
export const blockerText = (bs: readonly Blocker[]): string =>
  bs.map((b) => (b.pr ? `${b.ticket} · PR ${b.pr}` : b.ticket)).join(', ');

/** The kind as the row shows it */
export const rowLabel = (r: WaitRow): string =>
  r.kind === 'approved'
    ? `approved · waits on ${r.blockers}`
    : r.kind === 'hand-offs'
      ? `hand-offs · ${r.count ?? 0}`
      : r.kind;

/** What waits on you, furthest along first: PRs to review, hand-offs, questions, plans, tickets to label, ideas; approved plans held by a blocker come last */
export const waitRows = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): WaitRow[] => {
  const row = (
    id: string,
    kind: WaitRow['kind'],
    opts: { blockers?: readonly Blocker[]; count?: number } = {}
  ): WaitRow => {
    const { title, url } = m.get(id);
    const gateAt = m.gateAt.get(id) ?? null;
    return {
      id,
      title,
      url,
      kind,
      pr: prOf(details, id, queuePr(m, id)),
      age: m.waitAge.get(id) ?? null,
      count: opts.count ?? null,
      blockers: blockerText(opts.blockers ?? []),
      wait: prWaitPlain(m, id),
      gateAt,
      snoozed: isSnoozed({ id, kind }, gateAt, m.snoozes)
    };
  };
  const open = (id: string): readonly Blocker[] => m.blockers.get(id) ?? [];
  const before = (kind: 'plan' | 'question') =>
    m.before
      .filter((x) => (x.kind === 'plan' ? 'plan' : 'question') === kind)
      .map((x) => row(x.ticket, kind, { blockers: open(x.ticket) }));
  return [
    ...m.prs.map((x) => row(x.ticket, 'review', { blockers: open(x.ticket) })),
    ...m.handoffs.map((x) =>
      row(x.ticket, 'hand-offs', { count: x.items?.length ?? 0 })
    ),
    ...before('question'),
    ...before('plan'),
    ...m.toLabel.map((x) => row(x.ticket, 'ready to label')),
    ...m.ideasPending.map((i): WaitRow => {
      const gateAt = m.gateAt.get(i.id) ?? null;
      return {
        id: i.id,
        title: i.title,
        url: i.url,
        kind: 'idea',
        pr: null,
        age: i.createdAt
          ? (now.getTime() - Date.parse(i.createdAt)) / 6e4
          : null,
        count: null,
        blockers: '',
        wait: '',
        gateAt,
        snoozed: isSnoozed({ id: i.id, kind: 'idea' }, gateAt, m.snoozes)
      };
    }),
    ...m.heldApprovals.map((h) =>
      row(h.ticket, 'approved', { blockers: h.blockers })
    )
  ];
};

/** The rows that count toward the card's badge; approved rows only wait on a blocker, snoozed ones on a change */
export const countedRows = (rows: readonly WaitRow[]): WaitRow[] =>
  rows.filter((r) => r.kind !== 'approved' && !r.snoozed);
