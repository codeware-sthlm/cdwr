import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@codeware/shared/ui/shadcn/components/collapsible';
import {
  type FocusEvent,
  type ReactNode,
  useLayoutEffect,
  useRef
} from 'react';

import type { Issue } from '../../linear';
import { type PrCommandKind, prCommandKey } from '../commands';
import { CONFIRM_MS, GH_PR } from '../constants';
import { shortAge } from '../format';
import type { Model, WatchRef } from '../model';
import type { DeskState, Detail } from '../state';
import {
  type PrUi,
  type SnoozeUi,
  type WaitRow,
  awaitsWatch,
  copilotView,
  labelState,
  mergeBlocker,
  rowLabel,
  snoozeUi,
  waitRows,
  whyNot
} from '../view/waiting';

import { IdLink, Inline, LinkIds, PrPill, Prn } from './links';

// The Waiting on you sheet: one card per thing that waits on you, furthest along first, each with the one thing to do about it

/** What the sheet's buttons do; the page sends the commands and renders again */
export type WaitActions = {
  snooze: (r: WaitRow) => void;
  wake: (ticket: string) => void;
  label: (ticket: string) => void;
  pr: (ticket: string, kind: PrCommandKind, host: string, pr: number) => void;
};

/** A control's button and its note, apart: a card shows the notes with its statuses and the buttons on one row; null is nothing */
type Control = { button: ReactNode; note: ReactNode };

const NO_CONTROL: Control = { button: null, note: null };

const noteOf = (text: string | undefined): ReactNode =>
  text ? <span className="wnote">{text}</span> : null;

/** Both halves of two controls, in order */
const joinControls = (a: Control, b: Control): Control => ({
  button: (
    <>
      {a.button}
      {b.button}
    </>
  ),
  note:
    a.note === null && b.note === null ? null : (
      <>
        {a.note}
        {b.note}
      </>
    )
});

/** The Snooze or Wake button for a row, with the note a refusal left; nothing without controls */
const snoozeControl = (
  r: WaitRow,
  ui: SnoozeUi,
  actions: WaitActions
): Control => {
  if (!ui.on) return NO_CONTROL;
  const busy = ui.busy.has(r.id);
  const button = r.snoozed ? (
    <button
      type="button"
      className="wsnooze"
      data-wake={r.id}
      aria-label={`Wake ${r.id}`}
      disabled={busy}
      onClick={() => actions.wake(r.id)}
    >
      Wake
    </button>
  ) : (
    <button
      type="button"
      className="wsnooze"
      data-snooze={r.id}
      aria-label={`Snooze ${r.id} until it changes`}
      disabled={busy}
      onClick={() => actions.snooze(r)}
    >
      Snooze
    </button>
  );
  return { button, note: noteOf(ui.notes.get(r.id)) };
};

/** The Label agent:ready button of a ready-to-label row, or what became of it; nothing without controls */
const labelControl = (
  r: WaitRow,
  ui: SnoozeUi,
  now: number,
  actions: WaitActions
): Control => {
  if (!ui.on) return NO_CONTROL;
  const state = labelState(r.id, ui.label, now, r.gateAt);
  if (state === 'labelled')
    return { button: null, note: noteOf('labelled · waiting for the queue') };
  const button = (text: string, disabled = false) => (
    <button
      type="button"
      className="act secondary"
      data-label={r.id}
      disabled={disabled}
      onClick={() => actions.label(r.id)}
    >
      {text}
    </button>
  );
  if (state === 'labelling')
    return { button: button('labelling…', true), note: null };
  if (state === 'confirming')
    return { button: button('Confirm label'), note: null };
  return {
    button: button('Label agent:ready'),
    note: typeof state === 'object' ? noteOf(state.note) : null
  };
};

/** The Copilot review button for a PR, or where its review stands; nothing when the watch does not say */
const copilotControl = (
  r: WaitRow,
  { host, entry }: WatchRef,
  ui: PrUi,
  actions: WaitActions
): Control => {
  const view = copilotView(entry);
  if (view === null) return NO_CONTROL;
  const key = prCommandKey(r.id, entry.pr, 'copilot');
  const sent = ui.commands.get(key);
  const button = (text: string, disabled = false) => (
    <button
      type="button"
      className="wsnooze"
      data-copilot={r.id}
      disabled={disabled}
      onClick={() => actions.pr(r.id, 'copilot', host, entry.pr)}
    >
      {text}
    </button>
  );
  if (ui.controls.prSending.has(key) || sent?.state === 'pending')
    return { button: button('Copilot…', true), note: null };
  if (view !== 'button') return { button: null, note: noteOf(view.note) };
  // Asked, but the watch has not caught up with it yet
  if (awaitsWatch(sent, entry))
    return { button: null, note: noteOf('Copilot asked') };
  return {
    button: button('Copilot review'),
    note: noteOf(whyNot(key, ui, sent))
  };
};

/** The Merge button for a PR, asking to confirm first, or why it cannot be pressed or what became of it */
const mergeControl = (
  r: WaitRow,
  { host, entry }: WatchRef,
  ui: PrUi,
  now: number,
  actions: WaitActions
): Control => {
  const key = prCommandKey(r.id, entry.pr, 'merge');
  const sent = ui.commands.get(key);
  const button = (text: string, disabled = false, title?: string) => (
    <button
      type="button"
      className="wsnooze"
      data-merge={r.id}
      disabled={disabled}
      title={title}
      onClick={() => actions.pr(r.id, 'merge', host, entry.pr)}
    >
      {text}
    </button>
  );
  if (ui.controls.prSending.has(key) || sent?.state === 'pending')
    return { button: button('merging…', true), note: null };
  // Applied, until a newer watch says what became of it
  if (awaitsWatch(sent, entry))
    return { button: null, note: noteOf('in the merge queue') };
  const blocker = mergeBlocker(entry);
  if (blocker !== null)
    return {
      button: button('Merge', true, blocker),
      note: noteOf(blocker)
    };
  const asked = ui.controls.mergeConfirm.get(r.id);
  if (asked !== undefined && now - asked < CONFIRM_MS)
    return { button: button('Confirm merge'), note: null };
  return { button: button('Merge'), note: noteOf(whyNot(key, ui, sent)) };
};

/**
 * The Copilot review and Merge buttons of a review row whose PR a host watches; nothing without
 * controls, for any other row, or once the PR is merged or closed
 */
const prControl = (
  r: WaitRow,
  ui: SnoozeUi,
  now: number,
  actions: WaitActions
): Control => {
  if (!ui.on || r.kind !== 'review' || r.pr === null) return NO_CONTROL;
  const watched = ui.pr.watch.get(r.id);
  if (!watched || String(watched.entry.pr) !== String(r.pr)) return NO_CONTROL;
  if (watched.entry.state === 'merged' || watched.entry.state === 'closed')
    return NO_CONTROL;
  return joinControls(
    copilotControl(r, watched, ui.pr, actions),
    mergeControl(r, watched, ui.pr, now, actions)
  );
};

/** One card per waiting item, with the one thing to do about it */
const WaitCard = ({
  m,
  details,
  ui,
  now,
  r,
  actions
}: {
  m: Pick<Model, 'agentPrs'>;
  details: ReadonlyMap<string, Detail>;
  ui: SnoozeUi;
  now: Date;
  r: WaitRow;
  actions: WaitActions;
}) => {
  const hasPr = r.kind === 'review' && r.pr;
  const act =
    r.kind === 'review' && r.pr
      ? { text: 'Review on GitHub', href: GH_PR + r.pr }
      : r.kind === 'review'
        ? { text: 'Open ticket', href: r.url }
        : r.kind === 'hand-offs'
          ? { text: 'Open checklist', href: r.url }
          : r.kind === 'approved'
            ? { text: 'Open ticket', href: r.url }
            : r.kind === 'ready to label'
              ? // Beside the label button the link only opens the ticket
                {
                  text: ui.on ? 'Open ticket' : 'Label agent:ready',
                  href: r.url
                }
              : { text: 'Answer in Linear', href: r.url };
  const secondary = r.kind === 'ready to label' || r.kind === 'approved';
  const note = [
    // An approved card already names its blockers in its kind
    r.blockers && r.kind !== 'approved' ? 'After ' + r.blockers : '',
    r.wait
  ]
    .filter(Boolean)
    .join('. ');
  const prCtl = prControl(r, ui, now.getTime(), actions);
  const label =
    r.kind === 'ready to label'
      ? labelControl(r, ui, now.getTime(), actions)
      : NO_CONTROL;
  const snooze = snoozeControl(r, ui, actions);
  const hasStatus =
    hasPr ||
    prCtl.note !== null ||
    note !== '' ||
    label.note !== null ||
    snooze.note !== null;
  return (
    <article className={r.kind === 'approved' ? 'wcard approved' : 'wcard'}>
      <div className="wc-head">
        <IdLink id={r.id} />
        <span className={`kind k-${r.kind.replace(/ /g, '-')}`}>
          <LinkIds text={rowLabel(r)} />
        </span>
        <Prn n={r.pr} />
        {r.age === null ? null : <time>{`waiting ${shortAge(r.age)}`}</time>}
      </div>
      <div className="wc-title">{r.title}</div>
      {hasStatus ? (
        // The statuses, top to bottom: the PR, its Copilot and merge notes, blockers and review fixes, then any refusal
        <div className="wc-status">
          {hasPr ? (
            <div className="wc-pr">
              <PrPill
                m={m}
                details={details}
                x={{ ticket: r.id, pr: r.pr }}
                now={now}
              />
            </div>
          ) : null}
          {prCtl.note}
          {note ? (
            <div className="wc-note">
              <LinkIds text={note} />
            </div>
          ) : null}
          {label.note}
          {snooze.note}
        </div>
      ) : null}
      <div className="wc-actions">
        <a
          className={secondary ? 'act secondary' : 'act primary'}
          href={act.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {act.text}
        </a>
        {prCtl.button}
        {label.button}
        {snooze.button}
      </div>
    </article>
  );
};

/** An idea with its evidence; `controls` is the Snooze button the sheet gives it */
export const IdeaCard = ({
  i,
  details,
  controls
}: {
  i: Issue;
  details: ReadonlyMap<string, Detail>;
  controls?: ReactNode;
}) => {
  const d = details.get(i.id)?.idea;
  const when = new Date(i.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
  const part = (h: string, text: string | null | undefined) =>
    text ? (
      <div>
        <h4>{h}</h4>
        <p>
          <Inline text={text} />
        </p>
      </div>
    ) : null;
  return (
    <article className="idea">
      <a
        className="title"
        href={i.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="id">{i.id}</span>
        {i.title}
      </a>
      <div className="meta">
        <span>{`suggested ${when}`}</span>
        {d?.focus ? <span>{`· ${d.focus}`}</span> : null}
      </div>
      {controls}
      {details.has(i.id) ? (
        d ? (
          <>
            {d.evidence.length ? (
              <div>
                <h4>Evidence</h4>
                <ul>
                  {d.evidence.map((e, n) => (
                    <li key={n}>
                      <Inline text={e} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {part('What changes', d.change)}
            {part('Cost', d.cost)}
            {part('Why now', d.why)}
          </>
        ) : (
          <p className="rule">
            {
              "The ticket doesn't follow the suggestion shape; read it in Linear."
            }
          </p>
        )
      ) : (
        <p className="rule">Loading the ticket…</p>
      )}
      <p className="rule">
        Accept: set <code>agent:ready</code> on the ticket. Discard: cancel it
        with one word in a comment, such as <i>already decided</i>,{' '}
        <i>not worth it</i>, <i>wrong direction</i> or <i>later</i>. The agent
        reads the word before its next idea.
      </p>
    </article>
  );
};

/** The control of a focused button: the ticket its data attribute names */
const ticketOf = (button: HTMLElement): string | null =>
  button.dataset.label ??
  button.dataset.snooze ??
  button.dataset.wake ??
  button.dataset.merge ??
  button.dataset.copilot ??
  null;

type Props = {
  m: Model;
  state: DeskState;
  now: Date;
  /** Whether the fold of snoozed rows is open */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: WaitActions;
};

/** The Waiting on you sheet, with a fold for the snoozed rows */
export const BeforeSheet = ({
  m,
  state,
  now,
  open,
  onOpenChange,
  actions
}: Props) => {
  const root = useRef<HTMLDivElement>(null);
  // The control the viewer last focused: its ticket and the element itself
  const focused = useRef<{ ticket: string | null; el: Element | null }>({
    ticket: null,
    el: null
  });

  // A render that removes the focused button (a label sent, a row moved into or out of the fold)
  // drops focus to the body: put it on the same ticket's nearest control, else the fold's summary
  useLayoutEffect(() => {
    const { ticket, el } = focused.current;
    if (!ticket || !el || el.isConnected) return;
    if (document.activeElement !== document.body) return;
    for (const sel of [
      `[data-label="${ticket}"]`,
      `[data-snooze="${ticket}"]`,
      `[data-wake="${ticket}"]`,
      `[data-merge="${ticket}"]`,
      `[data-copilot="${ticket}"]`,
      '.snoozed-summary'
    ]) {
      const found = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>(sel) ?? []
      ).find((b) => !b.disabled);
      if (found) {
        found.focus();
        return;
      }
    }
  });

  const remember = (e: FocusEvent<HTMLDivElement>) => {
    const button =
      e.target instanceof Element ? e.target.closest('button') : null;
    if (button) focused.current = { ticket: ticketOf(button), el: button };
  };

  const body = (() => {
    if (!m.v) return <div className="empty">No queue view yet.</div>;
    const ui = snoozeUi(m, state.controls);
    const { details } = state;
    const card = (r: WaitRow) => (
      <WaitCard
        key={r.id + r.kind}
        m={m}
        details={details}
        ui={ui}
        now={now}
        r={r}
        actions={actions}
      />
    );
    // Ideas wait on you too, but their card below carries the evidence to decide on
    const all = waitRows(m, details, now);
    const rows = all.filter((r) => !r.snoozed);
    const snoozed = all.filter((r) => r.snoozed);
    const cards = (kinds: (k: WaitRow['kind']) => boolean) =>
      rows.filter((r) => kinds(r.kind)).map(card);
    // A snoozed idea sits in the fold, not among the ideas to decide
    const ideaRows = new Map(
      rows.filter((r) => r.kind === 'idea').map((r) => [r.id, r])
    );
    const awakeIdeas = m.ideasPending.filter((i) => ideaRows.has(i.id));
    const ideas = awakeIdeas.length ? (
      <div className="group">
        <h3>{`Ideas to decide · ${awakeIdeas.length}`}</h3>
        {awakeIdeas.map((i) => {
          const r = ideaRows.get(i.id);
          const c = r ? snoozeControl(r, ui, actions) : NO_CONTROL;
          return (
            <IdeaCard
              key={i.id}
              i={i}
              details={details}
              controls={
                <>
                  {c.button}
                  {c.note}
                </>
              }
            />
          );
        })}
      </div>
    ) : null;
    // Approved plans only wait on a blocker, so they come after everything that waits on you
    const awake = cards((k) => k !== 'idea' && k !== 'approved');
    const approved = cards((k) => k === 'approved');
    if (!awake.length && !ideas && !approved.length && !snoozed.length)
      return (
        <div className="empty">
          No PR, hand-off, plan, question, label or idea waits for you.
        </div>
      );
    return (
      <>
        {awake}
        {ideas}
        {approved}
        {snoozed.length ? (
          <Collapsible
            className="snoozed"
            open={open}
            onOpenChange={onOpenChange}
          >
            <CollapsibleTrigger className="snoozed-summary">
              {`Snoozed · ${snoozed.length}`}
            </CollapsibleTrigger>
            <CollapsibleContent>{snoozed.map(card)}</CollapsibleContent>
          </Collapsible>
        ) : null}
      </>
    );
  })();

  // `display: contents` keeps the sheet's own flow: the cards stay its direct children
  return (
    <div className="before-sheet" ref={root} onFocusCapture={remember}>
      {body}
    </div>
  );
};
