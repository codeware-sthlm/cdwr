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

import { EMPTY, GROUP, ID, META, TITLE } from './items-ui';
import { IdLink, Inline, LinkIds, PrPill, Prn } from './links';

// The Waiting on you sheet: one card per thing that waits on you, furthest along first, each with the one thing to do about it

// A card: a frame of the raised fill; an approved one is dimmed
const WCARD =
  'wcard flex min-w-0 flex-col gap-[9px] rounded-[var(--r-card)] border border-[color:var(--line-strong)] bg-[color:var(--raised)] px-3.5 py-[13px]';
const WCARD_APPROVED = `${WCARD} approved opacity-70`;
// The head: the ticket id, what it waits on, the PR number and how long; the ids and the time are small here
const WC_HEAD =
  'wc-head flex items-baseline gap-2 [&_.id]:mr-0 [&_.id]:font-[family-name:var(--font-mono)] [&_.id]:text-[12px] [&_.id]:leading-[normal] [&_.id]:font-semibold [&_.id]:text-[color:var(--fg)] [&_time]:ml-auto [&_time]:font-[family-name:var(--font-mono)] [&_time]:text-[10px] [&_time]:leading-[normal] [&_time]:font-normal [&_time]:text-[color:var(--muted)]';
// What the head's label says, the amber ones being the work that is yours to do
const AMBER_KINDS: ReadonlySet<string> = new Set([
  'plan',
  'question',
  'review',
  'hand-offs',
  'idea'
]);
const KIND = 'text-[11px] text-[color:var(--wait)]';
const KIND_QUIET = 'text-[11px] text-[color:var(--muted)]';
const WC_TITLE =
  'wc-title min-w-0 overflow-hidden text-[13px] font-normal text-ellipsis whitespace-nowrap text-[color:var(--fg)]';
// The statuses above the buttons, and the PR line among them
const WC_STATUS = 'wc-status flex flex-col gap-1.5';
const WC_PR =
  'wc-pr flex items-center gap-1.5 [&_time]:font-[family-name:var(--font-mono)] [&_time]:text-[10px] [&_time]:leading-[normal] [&_time]:font-normal [&_time]:text-[color:var(--muted)]';
// A small note in the panel's mono: a card's own, and the one a button leaves
const WC_NOTE =
  'wc-note font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
export const WNOTE =
  'wnote font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
// The buttons share one compact row, and wrap only when it is too narrow
const WC_ACTIONS = 'wc-actions flex flex-wrap items-center gap-2';
const ACT =
  'act inline-flex min-h-8 items-center self-auto rounded-[10px] px-3.5 py-0 text-[12px] font-semibold max-[600px]:min-h-[var(--tap)]';
const ACT_PRIMARY = `${ACT} primary bg-[color:var(--wait)] text-[#231803]`;
const ACT_SECONDARY = `${ACT} secondary border border-[color:var(--wait-line)] bg-transparent text-[color:var(--wait)] disabled:opacity-50`;
// The small quiet buttons: Snooze, Wake, Copilot review and Merge; in a card's button row, or alone under an idea
const WSNOOZE_TONE =
  'wsnooze border border-[color:var(--line)] bg-transparent text-[color:var(--muted)] hover:enabled:border-[color:var(--wait-dash)] hover:enabled:text-[color:var(--fg)] disabled:opacity-50';
const WSNOOZE = `${WSNOOZE_TONE} flex-none rounded-[var(--r-row)] px-2 py-0.5 text-[11px]`;
export const WSNOOZE_CARD = `${WSNOOZE_TONE} inline-flex min-h-8 flex-none items-center self-auto rounded-[10px] px-3 py-0 text-[12px] max-[600px]:min-h-[var(--tap)]`;

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
  text ? <span className={WNOTE}>{text}</span> : null;

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

/** The Snooze or Wake button for a row, with the note a refusal left; nothing without controls. `inCard` sizes it for a card's button row */
const snoozeControl = (
  r: WaitRow,
  ui: SnoozeUi,
  actions: WaitActions,
  inCard = false
): Control => {
  if (!ui.on) return NO_CONTROL;
  const busy = ui.busy.has(r.id);
  const className = inCard ? WSNOOZE_CARD : WSNOOZE;
  const button = r.snoozed ? (
    <button
      type="button"
      className={className}
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
      className={className}
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
      className={ACT_SECONDARY}
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
      className={WSNOOZE_CARD}
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
      className={WSNOOZE_CARD}
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
  const snooze = snoozeControl(r, ui, actions, true);
  const hasStatus =
    hasPr ||
    prCtl.note !== null ||
    note !== '' ||
    label.note !== null ||
    snooze.note !== null;
  return (
    <article className={r.kind === 'approved' ? WCARD_APPROVED : WCARD}>
      <div className={WC_HEAD}>
        <IdLink id={r.id} />
        <span
          className={`kind k-${r.kind.replace(/ /g, '-')} ${AMBER_KINDS.has(r.kind) ? KIND : KIND_QUIET}`}
        >
          <LinkIds text={rowLabel(r)} />
        </span>
        <Prn n={r.pr} />
        {r.age === null ? null : <time>{`waiting ${shortAge(r.age)}`}</time>}
      </div>
      <div className={WC_TITLE}>{r.title}</div>
      {hasStatus ? (
        // The statuses, top to bottom: the PR, its Copilot and merge notes, blockers and review fixes, then any refusal
        <div className={WC_STATUS}>
          {hasPr ? (
            <div className={WC_PR}>
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
            <div className={WC_NOTE}>
              <LinkIds text={note} />
            </div>
          ) : null}
          {label.note}
          {snooze.note}
        </div>
      ) : null}
      <div className={WC_ACTIONS}>
        <a
          className={secondary ? ACT_SECONDARY : ACT_PRIMARY}
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

/** A suggestion's card: the ticket's Evidence, What changes, Cost and Why now; its paragraphs, headings and bullets */
const IDEA =
  'idea grid min-w-0 gap-2.5 rounded-[10px] border border-l-4 border-[color:var(--line)] border-l-[color:var(--accent)] px-3.5 py-3';
const IDEA_H4 =
  'mb-[3px] text-[0.7rem] font-semibold tracking-[0.08em] text-[color:var(--muted)] uppercase';
const IDEA_P = 'text-[0.88rem] [overflow-wrap:anywhere]';
const IDEA_RULE = `rule text-[color:var(--muted)] ${IDEA_P}`;
const IDEA_LI =
  "relative pl-3.5 text-[0.85rem] [overflow-wrap:anywhere] before:absolute before:top-[0.55em] before:left-0 before:size-1.5 before:rounded-full before:bg-[color:var(--accent)] before:content-['']";

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
        <h4 className={IDEA_H4}>{h}</h4>
        <p className={IDEA_P}>
          <Inline text={text} />
        </p>
      </div>
    ) : null;
  return (
    <article className={IDEA}>
      <a
        className={TITLE}
        href={i.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={ID}>{i.id}</span>
        {i.title}
      </a>
      <div className={META}>
        <span>{`suggested ${when}`}</span>
        {d?.focus ? <span>{`· ${d.focus}`}</span> : null}
      </div>
      {controls}
      {details.has(i.id) ? (
        d ? (
          <>
            {d.evidence.length ? (
              <div>
                <h4 className={IDEA_H4}>Evidence</h4>
                <ul className="gap-1">
                  {d.evidence.map((e, n) => (
                    <li key={n} className={IDEA_LI}>
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
          <p className={IDEA_RULE}>
            {
              "The ticket doesn't follow the suggestion shape; read it in Linear."
            }
          </p>
        )
      ) : (
        <p className={IDEA_RULE}>Loading the ticket…</p>
      )}
      <p className={IDEA_RULE}>
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
    if (!m.v) return <div className={EMPTY}>No queue view yet.</div>;
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
      <div className={GROUP}>
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
        <div className={EMPTY}>
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

  // `contents` keeps the sheet's own flow: the cards stay its direct children
  return (
    <div className="contents" ref={root} onFocusCapture={remember}>
      {body}
    </div>
  );
};
