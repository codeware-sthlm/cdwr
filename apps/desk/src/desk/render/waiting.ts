import type { SnoozeRow } from '../../supabase';
import { PENDING_MAX_MS, type PrCommandState, prCommandKey } from '../commands';
import { CONFIRM_MS } from '../constants';
import { esc, shortAge } from '../format';
import { type Blocker, type Model, type WatchRef, prOf } from '../model';
import type { ControlsUi, Detail } from '../state';
import type { PrRef, WatchEntry } from '../types';

import { livePr, prTone, prWaitText, prn, queuePr } from './html';

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
  /** HTML note on a PR parked on review fixes; empty otherwise */
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

/** What the snooze buttons need: whether the controls are on, the tickets in flight and the notes to show, and whether the fold is open */
export type SnoozeUi = {
  on: boolean;
  busy: ReadonlySet<string>;
  notes: ReadonlyMap<string, string>;
  open: boolean;
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

/** No controls: no buttons, though a fold of snoozed rows still shows */
export const SNOOZE_OFF: SnoozeUi = {
  on: false,
  busy: new Set(),
  notes: new Map(),
  open: false,
  label: {
    labelConfirm: new Map(),
    labelling: new Set(),
    labelled: new Map(),
    labelNotes: new Map()
  },
  pr: {
    watch: new Map(),
    commands: new Map(),
    controls: {
      mergeConfirm: new Map(),
      prSending: new Set(),
      prNotes: new Map()
    }
  }
};

/** The snooze buttons' state from the model and the viewer's side of the controls */
export const snoozeUi = (m: Model, c: ControlsUi, open = false): SnoozeUi => ({
  on: m.controls !== null,
  busy: c.snoozing,
  notes: c.snoozeNotes,
  open,
  label: c,
  pr: { watch: m.watch, commands: m.prCommands, controls: c }
});

/** A control's buttons and its note, apart: a card shows the notes with its statuses and the buttons on one row */
export type Control = { button: string; note: string };

const NO_CONTROL: Control = { button: '', note: '' };

const noteHTML = (text: string | undefined): string =>
  text ? `<span class="wnote">${esc(text)}</span>` : '';

/** Both halves of several controls, in order */
export const joinControls = (...cs: readonly Control[]): Control => ({
  button: cs.map((c) => c.button).join(''),
  note: cs.map((c) => c.note).join('')
});

/** The Snooze or Wake button for a row, with the note a refusal left; empty without controls. Keep it outside any link */
export const snoozeControls = (r: WaitRow, ui: SnoozeUi): Control => {
  if (!ui.on) return NO_CONTROL;
  const id = esc(r.id);
  const busy = ui.busy.has(r.id) ? ' disabled' : '';
  const button = r.snoozed
    ? `<button type="button" class="wsnooze" data-wake="${id}" aria-label="Wake ${id}"${busy}>Wake</button>`
    : `<button type="button" class="wsnooze" data-snooze="${id}" data-kind="${esc(r.kind)}" data-event-at="${esc(r.gateAt ?? '')}" aria-label="Snooze ${id} until it changes"${busy}>Snooze</button>`;
  return { button, note: noteHTML(ui.notes.get(r.id)) };
};

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

/** The Label agent:ready button for a ready-to-label row, or what became of it; empty without controls. Keep it outside any link */
export const labelControls = (
  r: WaitRow,
  ui: SnoozeUi,
  now: number,
  className = 'wsnooze'
): Control => {
  if (!ui.on) return NO_CONTROL;
  const state = labelState(r.id, ui.label, now, r.gateAt);
  if (state === 'labelled')
    return { button: '', note: noteHTML('labelled · waiting for the queue') };
  const id = esc(r.id);
  const button = (text: string, extra = ''): string =>
    `<button type="button" class="${className}" data-label="${id}"${extra}>${text}</button>`;
  if (state === 'labelling')
    return { button: button('labelling…', ' disabled'), note: '' };
  if (state === 'confirming')
    return { button: button('Confirm label'), note: '' };
  return {
    button: button('Label agent:ready'),
    note: typeof state === 'object' ? noteHTML(state.note) : ''
  };
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
const whyNot = (
  key: string,
  ui: PrUi,
  sent: PrCommandState | undefined
): string =>
  ui.controls.prNotes.get(key) ?? (sent?.state === 'refused' ? sent.note : '');

/** True while the command was applied and no watch snapshot newer than that has arrived to say what became of it */
const awaitsWatch = (
  sent: PrCommandState | undefined,
  entry: WatchEntry
): boolean =>
  sent?.state === 'applied' &&
  !(
    sent.at !== null &&
    entry.at !== null &&
    Date.parse(entry.at) > Date.parse(sent.at)
  );

/** The Copilot review button for a PR, or where its review stands; empty when the watch does not say */
const copilotControl = (
  r: WaitRow,
  { host, entry }: WatchRef,
  ui: PrUi
): Control => {
  const view = copilotView(entry);
  if (view === null) return NO_CONTROL;
  const key = prCommandKey(r.id, entry.pr, 'copilot');
  const sent = ui.commands.get(key);
  const button = (text: string, extra = ''): string =>
    `<button type="button" class="wsnooze" data-copilot="${esc(r.id)}" data-pr="${esc(entry.pr)}" data-host="${esc(host)}"${extra}>${text}</button>`;
  const note = (text: string): Control => ({
    button: '',
    note: noteHTML(text)
  });
  if (ui.controls.prSending.has(key) || sent?.state === 'pending')
    return { button: button('Copilot…', ' disabled'), note: '' };
  if (view !== 'button') return note(view.note);
  // Asked, but the watch has not caught up with it yet
  if (awaitsWatch(sent, entry)) return note('Copilot asked');
  return {
    button: button('Copilot review'),
    note: noteHTML(whyNot(key, ui, sent))
  };
};

/** The Merge button for a PR, asking to confirm first, or why it cannot be pressed or what became of it */
const mergeControl = (
  r: WaitRow,
  { host, entry }: WatchRef,
  ui: PrUi,
  now: number
): Control => {
  const key = prCommandKey(r.id, entry.pr, 'merge');
  const sent = ui.commands.get(key);
  const button = (text: string, extra = ''): string =>
    `<button type="button" class="wsnooze" data-merge="${esc(r.id)}" data-pr="${esc(entry.pr)}" data-host="${esc(host)}"${extra}>${text}</button>`;
  if (ui.controls.prSending.has(key) || sent?.state === 'pending')
    return { button: button('merging…', ' disabled'), note: '' };
  // Applied, until a newer watch says what became of it
  if (awaitsWatch(sent, entry))
    return { button: '', note: noteHTML('in the merge queue') };
  const blocker = mergeBlocker(entry);
  if (blocker !== null)
    return {
      button: button('Merge', ` disabled title="${esc(blocker)}"`),
      note: noteHTML(blocker)
    };
  const asked = ui.controls.mergeConfirm.get(r.id);
  if (asked !== undefined && now - asked < CONFIRM_MS)
    return { button: button('Confirm merge'), note: '' };
  return { button: button('Merge'), note: noteHTML(whyNot(key, ui, sent)) };
};

/**
 * The Copilot review and Merge buttons of a review row whose PR a host watches; empty without
 * controls, for any other row, or once the PR is merged or closed. Keep it outside any link
 */
export const prControls = (r: WaitRow, ui: SnoozeUi, now: number): Control => {
  if (!ui.on || r.kind !== 'review' || r.pr === null) return NO_CONTROL;
  const watched = ui.pr.watch.get(r.id);
  if (!watched || String(watched.entry.pr) !== String(r.pr)) return NO_CONTROL;
  if (watched.entry.state === 'merged' || watched.entry.state === 'closed')
    return NO_CONTROL;
  return joinControls(
    copilotControl(r, watched, ui.pr),
    mergeControl(r, watched, ui.pr, now)
  );
};

/** The fold of snoozed rows, collapsed unless the viewer opened it; empty when none are */
export const snoozedFold = (n: number, inner: string, open = false): string =>
  n
    ? `<details class="snoozed"${open ? ' open' : ''}><summary>Snoozed · ${n}</summary>${inner}</details>`
    : '';

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
      wait: prWaitText(m, id),
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

/** One line per row: the row links to the ticket, the PR number beside it tinted by its state. Notes and buttons are the panel's */
const rowHTML =
  (m: Model, details: ReadonlyMap<string, Detail>) =>
  (r: WaitRow): string => {
    const tone = prTone(
      livePr(m, details, { ticket: r.id, pr: r.pr }).live?.state ?? null
    );
    return `<li class="wrow-li${r.kind === 'approved' ? ' approved' : ''}"><a class="wrow" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="id">${esc(r.id)}</span><span class="t">${esc(r.title)}</span><span class="kind"${r.kind === 'approved' ? ` title="${esc(rowLabel(r))}"` : ''}>${esc(rowLabel(r))}</span>${r.age === null ? '' : `<time>${esc(shortAge(r.age))}</time>`}</a>${prn(r.pr, tone)}</li>`;
  };

export const renderWaiting = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date,
  ui: SnoozeUi = SNOOZE_OFF
): string => {
  const loading = !m.runs;
  const all = loading ? [] : waitRows(m, details, now);
  const rows = all.filter((r) => !r.snoozed);
  const snoozed = all.filter((r) => r.snoozed);
  const count = countedRows(all).length;
  const li = rowHTML(m, details);
  // One button for both widths: CSS shows it and picks the count per breakpoint
  const desk = rows.length > DESKTOP_ROWS;
  const more =
    rows.length > PHONE_ROWS
      ? `<button type="button" class="more-all${desk ? ' more-desk' : ''}" aria-haspopup="dialog">+ <span class="more-n phone">${rows.length - PHONE_ROWS}</span>${desk ? `<span class="more-n desk">${rows.length - DESKTOP_ROWS}</span>` : ''} more — open all</button>`
      : '';
  const fold = snoozedFold(
    snoozed.length,
    `<ul class="wrows">${snoozed.map(li).join('')}</ul>`,
    ui.open
  );
  const body = loading
    ? '<p class="none">Loading…</p>'
    : (rows.length
        ? `<ul class="wrows">${rows.map(li).join('')}</ul>${more}`
        : '<p class="none">Nothing waits on you.</p>') + fold;
  return `<article class="card-top waiting${count ? ' has' : ''}" data-w="before">
    <div class="ct-head"><button type="button" class="open state" aria-haspopup="dialog">Waiting on you</button><b class="count">${loading ? '–' : count}</b></div>
    ${body}
    ${rows.length ? '<p class="foot">wait age from activity gate events · answering unblocks the next run</p>' : ''}
  </article>`;
};
