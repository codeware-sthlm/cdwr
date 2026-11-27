import type { SnoozeRow } from '../../supabase';
import { PENDING_MAX_MS, type PrCommandState } from '../commands';
import { CONFIRM_MS } from '../constants';
import {
  type Blocker,
  type Model,
  type WatchRef,
  isRealGap,
  prOf
} from '../model';
import { openApply } from '../parsers';
import type { ControlsUi, Detail } from '../state';
import type { PrRef, QueueGap, QueueParked, WatchEntry } from '../types';

import { copilotStall, prWaitPlain } from './parked';
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
    | 'approved'
    | 'gap'
    | 'cleanup';
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
  /** Why the watch's own merge holds, as the queue view says it; null when it does not */
  held: string | null;
  /** Approved on GitHub while the watch's own hold lasts, so Merge is Håkan's to press; false for every other row */
  approved: boolean;
  /** main's ruleset wants Håkan's review on GitHub; false for every other row */
  reviewRequired: boolean;
  /** The changed files main's ruleset requires a review for; null when unread or not a review row */
  reviewPaths: readonly string[] | null;
  /** ISO time of the activity event the wait counts from; null without activity */
  gateAt: string | null;
  /** Snoozed until something changes; such a row leaves every count */
  snoozed: boolean;
  /** The audit's gap a gap or cleanup row stands for; null for any other kind */
  gap: WaitGap | null;
};

/** A gap as the Waiting on you rows carry it: its audit kind, what is wrong, the one fix, and the tickets it covers (several for cleanup) */
export type WaitGap = {
  kind: string;
  what: string;
  fix: string;
  tickets: { id: string; title: string }[];
};

/** The audit kind folded into one cleanup row: a closed ticket still carrying an agent label, a one-label fix each */
export const CLEANUP_GAP = 'label-on-closed';

/** The id of the one cleanup row */
export const CLEANUP_ID = 'cleanup';

/** The first command a gap's fix names in a code span, for the Copy button; null without one */
export const fixCommand = (fix: string): string | null =>
  /`([^`]+)`/.exec(fix)?.[1] ?? null;

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

/** What the watch's verdict starts with while a ruleset review is missing */
const RULESET_HELD = "needs Håkan's approval on GitHub";

/** The watch's verdict while a ruleset review is missing, in its words (guard.jq `ruleset_gate`): the first path, the rest counted */
const needsApproval = (paths: readonly string[]): string =>
  paths.length === 0
    ? RULESET_HELD
    : `${RULESET_HELD} (${paths[0]}${paths.length > 1 ? `, +${paths.length - 1} more` : ''})`;

/** Why the scheduler would refuse to merge the PR, in its words (guard.jq `desk_verdict`); null when it would not */
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
  // The gate's own words, its refusals when it could not check included; older entries carry reviewNeeded only
  if (e.reviewWhy) return e.reviewWhy;
  if (e.reviewNeeded === true) return needsApproval(e.reviewPaths ?? []);
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
      : r.kind === 'gap'
        ? `gap · ${r.gap?.kind ?? ''}`
        : r.kind === 'cleanup'
          ? `cleanup · ${r.count ?? 0}`
          : r.kind;

/** Whether the watch's verdict is the ruleset's missing review */
export const isRulesetHeld = (held: string | null): boolean =>
  held !== null && held.startsWith(RULESET_HELD);

/** What a row needing Håkan's review on GitHub says */
export const REVIEW_NEEDED =
  "Needs your approval on GitHub: main's ruleset requires your review";

/**
 * The held line under a review row: the ruleset named as the blocker, any other verdict as it is.
 * An approval never releases the watch's own hold, so it only changes what the line tells to do;
 * the watch sends `approved` only for a hold that lasts
 */
export const heldText = (held: string, approved = false): string =>
  isRulesetHeld(held)
    ? REVIEW_NEEDED
    : approved
      ? `Approved on GitHub, press Merge. Held: ${held}`
      : `Merge held: ${held}`;

/** The protected paths line under a row needing the review: the first 3 files, none matched, or not read */
export const reviewPathsText = (paths: readonly string[] | null): string =>
  paths === null
    ? 'Protected paths could not be read'
    : paths.length === 0
      ? 'No changed file matches the protected paths'
      : `Protected paths: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? `, +${paths.length - 3} more` : ''}`;

/**
 * What waits on you, furthest along first: gaps that stop work, PRs to review, hand-offs,
 * questions, plans, tickets to label, ideas, then the closed tickets to clean up as one row;
 * approved plans held by a blocker come last. Candidate gaps are hints for the review, not rows
 */
export const waitRows = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): WaitRow[] => {
  const row = (
    id: string,
    kind: WaitRow['kind'],
    opts: {
      blockers?: readonly Blocker[];
      count?: number;
      stall?: string | null;
      held?: string | null;
      approved?: boolean;
      reviewRequired?: boolean;
      reviewPaths?: readonly string[] | null;
    } = {}
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
      wait: [prWaitPlain(m, id), opts.stall].filter(Boolean).join('. '),
      held: opts.held ?? null,
      approved: opts.approved ?? false,
      reviewRequired: opts.reviewRequired ?? false,
      reviewPaths: opts.reviewPaths ?? null,
      gateAt,
      snoozed: isSnoozed({ id, kind }, gateAt, m.snoozes),
      gap: null
    };
  };
  const open = (id: string): readonly Blocker[] => m.blockers.get(id) ?? [];
  // A ticket outside the desk's index is a stub without a title; the gap carries its own
  const ticketOf = (g: QueueGap) => ({
    id: g.ticket,
    title: m.get(g.ticket).title || g.title || ''
  });
  const real = m.gaps.filter(isRealGap);
  // A gap is fixed, not snoozed: its row never sleeps. Its age would be the ticket's gate
  // event, not how long the gap has stood, so it shows none
  const gapRow = (g: QueueGap): WaitRow => {
    const t = ticketOf(g);
    return {
      ...row(g.ticket, 'gap'),
      title: t.title,
      age: null,
      snoozed: false,
      gap: { kind: g.kind, what: g.what, fix: g.fix, tickets: [t] }
    };
  };
  const closed = real.filter((g) => g.kind === CLEANUP_GAP);
  const cleanup: WaitRow[] = closed.length
    ? [
        {
          id: CLEANUP_ID,
          title: 'Closed tickets still carrying an agent label',
          url: '',
          kind: 'cleanup',
          pr: null,
          age: null,
          count: closed.length,
          blockers: '',
          wait: '',
          held: null,
          approved: false,
          reviewRequired: false,
          reviewPaths: null,
          gateAt: null,
          snoozed: false,
          gap: {
            kind: CLEANUP_GAP,
            what: `${closed.length} closed ${closed.length === 1 ? 'ticket still carries' : 'tickets still carry'} an agent label`,
            fix: closed[0].fix,
            tickets: closed.map(ticketOf)
          }
        }
      ]
    : [];
  const before = (kind: 'plan' | 'question') =>
    m.before
      .filter((x) => (x.kind === 'plan' ? 'plan' : 'question') === kind)
      .map((x) => row(x.ticket, kind, { blockers: open(x.ticket) }));
  const stall = (p: QueueParked | undefined) =>
    p ? copilotStall(p, now) : null;
  const rest: WaitRow[] = [
    ...m.prs.map((x) =>
      row(x.ticket, 'review', {
        blockers: open(x.ticket),
        stall: stall(m.prWaits.get(x.ticket)),
        held: x.held ?? null,
        approved: x.approved ?? false,
        reviewRequired: x.reviewRequired ?? false,
        reviewPaths: x.reviewPaths ?? null
      })
    ),
    // A stalled wait on Copilot whose PR is not among the open ones still wants the Copilot button
    ...m.parked.flatMap((p) => {
      const why = stall(p);
      return why === null ? [] : [row(p.ticket, 'review', { stall: why })];
    }),
    ...m.handoffs.map((x) =>
      row(x.ticket, 'hand-offs', {
        count:
          (x.items?.length ?? 0) + openApply(m.apply.get(x.ticket) ?? []).length
      })
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
        held: null,
        approved: false,
        reviewRequired: false,
        reviewPaths: null,
        gateAt,
        snoozed: isSnoozed({ id: i.id, kind: 'idea' }, gateAt, m.snoozes),
        gap: null
      };
    }),
    ...cleanup,
    ...m.heldApprovals.map((h) =>
      row(h.ticket, 'approved', { blockers: h.blockers })
    )
  ];
  // One row per ticket: a ticket another row or the cleanup row already lists keeps that row,
  // and a ticket with several gaps shows the first the audit gives
  const listed = new Set([
    ...rest.map((r) => r.id),
    ...closed.map((g) => g.ticket)
  ]);
  const gaps: WaitRow[] = [];
  for (const g of real) {
    if (g.kind === CLEANUP_GAP || listed.has(g.ticket)) continue;
    listed.add(g.ticket);
    gaps.push(gapRow(g));
  }
  return [...gaps, ...rest];
};

/** The rows that count toward the card's badge; approved rows only wait on a blocker, snoozed ones on a change */
export const countedRows = (rows: readonly WaitRow[]): WaitRow[] =>
  rows.filter((r) => r.kind !== 'approved' && !r.snoozed);
