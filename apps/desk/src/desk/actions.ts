import { isTauri } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';

import { deskSha } from '../build-info';
import type { Adapter } from '../data';
import { LinearError, linearMessage } from '../linear';
import type { IssueEventRow } from '../supabase';

import {
  type CommandArgs,
  CommandError,
  type CommandTarget,
  type Control,
  type ControlKind,
  type PrCommandKind,
  prCommandKey,
  sendCommand
} from './commands';
import type { WaitActions } from './components/before';
import type { PlatformActions } from './components/platform';
import type { ProblemActions } from './components/problems';
import type { SettingsOptions } from './components/settings';
import type { SheetActions } from './components/sheets';
import { CONFIRM_MS, SEARCH_ID } from './constants';
import { type Loader, createLoader } from './load';
import { type ControlsModel, type Model, model } from './model';
import {
  type Connection,
  type SheetId,
  type TreeFilter,
  type View,
  createState,
  emptyControls,
  isFilter,
  isTreeFilter,
  sheetIdOf,
  viewOf
} from './state';
import { createStore } from './store';
import { CAP_RANGE, LIMIT_RANGE } from './view/controls';
import { canonicalId, isTicketId } from './view/ids';

// This build, and whether it is the web desk the NUC serves rather than the Mac app: that
// decides which workflow's build main is compared with
const DESK = deskSha();
const WEB = !isTauri();

/** Everything the page shows and the viewer chose; survives a settings re-start */
export const store = createStore(createState());
const state = store.state;

/** The model of the state at a moment */
export const modelAt = (now: Date): Model => model(state, now, DESK, WEB);

let adapter: Adapter | null = null; // set by start()
let loader: Loader | null = null;
let labeller: ((ticket: string) => Promise<void>) | null = null; // set by setLabeller()
let settingsOpener: (() => void) | null = null; // set by setSettingsOpener()
/** A second press this soon after the first is a double-click, not a confirmation */
const DOUBLE_CLICK_MS = 300;

/** What the sheet frame and the header show beyond the state */
export const frame = {
  /** The sheet last opened: still drawn while it animates out */
  shownSheet: 'before' as SheetId,
  /** Whether the open sheet takes focus; false for one opened by the start hash */
  sheetFocus: true,
  /** The settings form, open in the same frame; it is no sheet and has no hash */
  settings: null as SettingsOptions | null,
  /** The settings form is drawn while it animates out */
  settingsShown: false,
  /** A new key per opening, so the form starts from the saved values */
  settingsForm: 0,
  /** Refresh was pressed and nothing has changed since */
  refreshing: false
};
// The sheet that just closed, whose tile or card takes focus back
let closedSheet: SheetId | null = null;
// What had focus when the Ticket sheet opened, which takes it back
let ticketOpener: HTMLElement | null = null;

/** Redraws the page after a change to the state */
function render(): void {
  frame.refreshing = false;
  store.notify();
}

// ---------- View ----------

/** The URL hash that names what is open: a sheet, else the view, else nothing */
function setHash(): void {
  const { openSheet, ticket } = state.ui;
  const hash =
    openSheet === 'ticket' && ticket
      ? `ticket/${ticket}`
      : (openSheet ?? (state.ui.view === 'desk' ? '' : state.ui.view));
  try {
    window.history.replaceState(
      null,
      '',
      hash ? '#' + hash : window.location.pathname + window.location.search
    );
  } catch {
    // Some webviews refuse to change the URL
  }
}

/** Shows the desk or a full-page view in its place */
export function showView(view: View, focus = true): void {
  const left = state.ui.view;
  state.ui.view = view;
  // A render is asynchronous: flushed here, the view's title exists before it takes focus
  flushSync(render);
  setHash();
  if (!focus) return;
  // Back on the desk, focus goes to the header button of the view just left
  if (view === 'desk')
    document.querySelector<HTMLElement>(`[data-view="${left}"]`)?.focus();
  else document.getElementById(`${view}-title`)?.focus();
}

// ---------- Sheet ----------

export function closeSettings(): void {
  frame.settings = null;
  render();
}

/** Once the settings form has animated out: focus goes back to the Settings button */
export function settingsClosed(): void {
  frame.settingsShown = false;
  document.getElementById('settings')?.focus();
}

/** Opens the settings form in the sheet frame, closing any sheet that is open */
export function openSettings(options: SettingsOptions): void {
  if (state.ui.openSheet) {
    state.ui.openSheet = null;
    setHash();
  }
  frame.settings = options;
  frame.settingsShown = true;
  frame.settingsForm += 1;
  render();
}

/** Sets what the header's Settings button opens */
export function setSettingsOpener(fn: () => void): void {
  settingsOpener = fn;
}

export function clickSettings(): void {
  settingsOpener?.();
}

export function showSheet(value: string, focus = true): void {
  const id = sheetIdOf(value);
  if (!id) return;
  if (frame.settings) return;
  // The Ticket sheet has nothing to show until a ticket is chosen
  if (id === 'ticket' && !state.ui.ticket) return;
  frame.settingsShown = false;
  state.ui.openSheet = id;
  frame.shownSheet = id;
  frame.sheetFocus = focus;
  render();
  setHash();
}

export function hideSheet(): void {
  closedSheet = state.ui.openSheet;
  state.ui.openSheet = null;
  render();
  setHash();
}

/** Opens the Ticket sheet on a ticket; from inside the sheet it switches ticket and keeps the first opener */
export function openTicket(id: string, focus = true): void {
  if (frame.settings) return;
  const active = document.activeElement;
  if (state.ui.openSheet !== 'ticket')
    ticketOpener = focus && active instanceof HTMLElement ? active : null;
  state.ui.ticket = id;
  showSheet('ticket', focus);
}

/** Puts focus back on the tile or card that opened the sheet */
export function focusOpener(): void {
  const sheet = closedSheet;
  closedSheet = null;
  // Radix can report the close twice; the second has nothing left to focus
  if (sheet === null) return;
  if (sheet === 'ticket') {
    // The element that opened the ticket (a search result, a tree row), else the search field
    const opener = ticketOpener?.isConnected
      ? ticketOpener
      : document.getElementById(SEARCH_ID);
    ticketOpener = null;
    opener?.focus();
    return;
  }
  const el = document.querySelector<HTMLElement>(`[data-w="${sheet}"]`);
  (el?.matches('button')
    ? el
    : el?.querySelector<HTMLElement>('.open')
  )?.focus();
}

/** Opens what the URL hash names at start: a full-page view or a sheet, without taking focus */
export function openStartHash(): void {
  const startHash = (window.location.hash || '').slice(1);
  const view = viewOf(startHash);
  if (view) showView(view, false);
  else {
    const raw = startHash.startsWith('ticket/') ? startHash.slice(7) : '';
    const ticket = isTicketId(raw) ? raw : canonicalId(raw);
    if (ticket) openTicket(ticket, false);
    // A bare `#ticket` names no ticket and opens nothing: showSheet refuses it
    else showSheet(startHash, false);
  }
}

const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Selects a node's text, for the copy a blocked clipboard leaves to the viewer */
function selectText(node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function copyRow(raw: HTMLElement): void {
  const text = raw.textContent ?? '';
  if (!navigator.clipboard) {
    selectText(raw);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => selectText(raw));
}

/** The controls as the model sees them now; null when the desk cannot send */
function controlsNow(): ControlsModel | null {
  return state.controls.target ? modelAt(new Date()).controls : null;
}

// The controls' actions, shared by the capacity row and the Platform view

export function pauseQueue(kind: 'pause' | 'resume'): void {
  const m = controlsNow();
  if (m) sendControl('pause', m.host, kind);
}

export function runNow(): void {
  const m = controlsNow();
  if (m) sendControl('run', m.host, 'run');
}

/** Moves a stepper's draft within its range */
function stepDraft(control: 'limit' | 'cap', delta: number): void {
  const m = controlsNow();
  if (!m) return;
  const range = control === 'limit' ? LIMIT_RANGE : CAP_RANGE;
  const next = (m[control].draft ?? 0) + delta;
  state.controls.drafts[control] = Math.min(
    range.max,
    Math.max(range.min, next)
  );
  render();
}

function applyDraft(control: 'limit' | 'cap'): void {
  const m = controlsNow();
  const draft = m?.[control].draft ?? null;
  if (m && draft !== null)
    sendControl(control, m.host, control, { value: draft });
}

/** Scrolls to a problem's card on the desk */
function showProblem(id: string): void {
  showView('desk', false);
  const card = document.getElementById(id);
  card?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  card?.focus({ preventScroll: true });
}

/** What the Platform view's buttons do */
export const platformActions: PlatformActions = {
  desk: () => showView('desk'),
  problem: showProblem,
  sheet: (id) => showSheet(id),
  pause: pauseQueue,
  run: runNow,
  step: stepDraft,
  apply: applyDraft
};

/** The abandon button: the first press asks to confirm, the second marks the run abandoned */
function abandonRun(): void {
  const c = state.controls;
  const m = controlsNow();
  if (!m) return;
  if (!m.confirming)
    c.confirm = { until: Date.now() + CONFIRM_MS, session: m.session };
  else {
    c.confirm = null;
    sendControl(
      'abandon',
      m.host,
      'abandon',
      m.session === null ? {} : { session: m.session }
    );
  }
  render();
}

/** What the alert's link and the problem cards' buttons do */
export const problemActions: ProblemActions = {
  seeProblems: () => {
    // The alert shows on the Platform view too, where the problems are hidden
    if (state.ui.view !== 'desk') showView('desk', false);
    document.getElementById('problems')?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth'
    });
  },
  reconnect: () => void adapter?.reconnect(),
  reload: () => window.location.reload(),
  copyRow,
  platform: () => showView('platform'),
  abandon: abandonRun
};

/** A Snooze or Wake click on a waiting row: `snooze` says what to snooze it on, null wakes it */
function clickSnooze(
  ticket: string,
  snooze: { kind: string; eventAt: string | null } | null
): void {
  const host = modelAt(new Date()).controls?.host;
  if (!state.controls.target || !host) return;
  sendSnooze(ticket, host, snooze);
}

/** A Label click: the first asks to confirm, a deliberate second one sends */
function clickLabel(ticket: string): void {
  const c = state.controls;
  if (!labeller || c.labelling.has(ticket)) return;
  const asked = c.labelConfirm.get(ticket);
  // A double-click is not a confirmation: the second press has to be deliberate
  if (asked !== undefined && Date.now() - asked < DOUBLE_CLICK_MS) return;
  if (asked === undefined || Date.now() - asked >= CONFIRM_MS) {
    const askedAt = Date.now();
    c.labelConfirm.set(ticket, askedAt);
    c.labelNotes.delete(ticket);
    render();
    // Nothing else redraws the row when this confirmation lapses; one that was consumed or
    // renewed meanwhile is left alone
    setTimeout(() => {
      if (c.labelConfirm.get(ticket) !== askedAt) return;
      c.labelConfirm.delete(ticket);
      render();
    }, CONFIRM_MS + 50);
    return;
  }
  c.labelConfirm.delete(ticket);
  c.labelling.add(ticket);
  render();
  labeller(ticket)
    .then(() => {
      c.labelled.set(ticket, Date.now());
    })
    .catch((error: unknown) => {
      c.labelNotes.set(
        ticket,
        error instanceof LinearError
          ? linearMessage(error)
          : error instanceof Error
            ? error.message
            : 'The label failed.'
      );
    })
    .finally(() => {
      c.labelling.delete(ticket);
      render();
    });
}

/** A Copilot review or Merge click: a merge asks to confirm first */
function clickPr(
  ticket: string,
  kind: PrCommandKind,
  host: string,
  pr: number
): void {
  const c = state.controls;
  if (!c.target) return;
  const key = prCommandKey(ticket, pr, kind);
  if (c.prSending.has(key)) return;
  if (kind === 'merge') {
    const asked = c.mergeConfirm.get(ticket);
    // A double-click is not a confirmation: the second press has to be deliberate
    if (asked !== undefined && Date.now() - asked < DOUBLE_CLICK_MS) return;
    if (asked === undefined || Date.now() - asked >= CONFIRM_MS) {
      const askedAt = Date.now();
      c.mergeConfirm.set(ticket, askedAt);
      c.prNotes.delete(key);
      render();
      // Nothing else redraws the row when this confirmation lapses; one that was consumed or
      // renewed meanwhile is left alone
      setTimeout(() => {
        if (c.mergeConfirm.get(ticket) !== askedAt) return;
        c.mergeConfirm.delete(ticket);
        render();
      }, CONFIRM_MS + 50);
      return;
    }
    c.mergeConfirm.delete(ticket);
  }
  sendPr(ticket, kind, host, pr);
}

/** What the Waiting on you sheet's buttons do */
const waitActions: WaitActions = {
  snooze: (r) => clickSnooze(r.id, { kind: r.kind, eventAt: r.gateAt }),
  wake: (ticket) => clickSnooze(ticket, null),
  label: clickLabel,
  pr: clickPr
};

/** Opens or closes the fold of snoozed rows, on the card and in its sheet alike */
export function setSnoozedOpen(open: boolean): void {
  state.ui.snoozedOpen = open;
  render();
}

/** What the sheets' controls do */
export const sheetActions: SheetActions = {
  wait: waitActions,
  onTicket: (id) => openTicket(id),
  onSnoozedOpen: setSnoozedOpen,
  onActFilter: (ticket) => {
    state.ui.actFilter = ticket;
    render();
  },
  onFilter: (filter) => {
    state.ui.filter = filter;
    try {
      localStorage.setItem('aq-filter', state.ui.filter);
    } catch {
      // Storage is unavailable: the filter lasts until the page closes
    }
    render();
  }
};

/** Sets the Ticket tree's filters, kept for the next visit */
export function setTreeFilter(tree: TreeFilter): void {
  state.ui.tree = tree;
  try {
    localStorage.setItem('aq-tree', JSON.stringify(tree));
  } catch {
    // Storage is unavailable: the filters last until the page closes
  }
  render();
}

// ---------- Load ----------

export function refresh(): void {
  if (!loader) return;
  frame.refreshing = true;
  store.notify();
  void loader.refresh();
}

try {
  const f = localStorage.getItem('aq-filter');
  if (isFilter(f)) state.ui.filter = f;
  const t: unknown = JSON.parse(localStorage.getItem('aq-tree') ?? 'null');
  if (isTreeFilter(t)) state.ui.tree = t;
} catch {
  // Storage is unavailable or holds junk: the filters start at their default
}

/** Records the Realtime channel's health for the model's problems and health checks */
export function setConnection(
  live: boolean,
  connection: Omit<Connection, 'live' | 'lastIssue'>
): void {
  state.data.connection = { ...state.data.connection, live, ...connection };
  render();
}

/** Records the newest issue event, the pulse's Linear side */
export function setLastIssue(row: IssueEventRow): void {
  state.data.connection = { ...state.data.connection, lastIssue: row };
  render();
}

/** Starts the page on a data adapter; called again with a new one when the settings change */
export function start(next: Adapter | null): void {
  adapter = next;
  loader?.stop();
  loader = next ? createLoader({ adapter: next, state, render }) : null;
  loader?.watchAll();
  render();
}

/** Turns the controls on with a target, or off with null; the token never reaches the model */
export function setControls(target: CommandTarget | null): void {
  state.controls = emptyControls(target);
  render();
}

/** Sets what a confirmed Label click calls; the buttons themselves show with the controls */
export function setLabeller(fn: (ticket: string) => Promise<void>): void {
  labeller = fn;
  render();
}

/** Snoozes a waiting row until it changes, or wakes it; the row moves at once, Realtime then confirms */
function sendSnooze(
  ticket: string,
  host: string,
  snooze: { kind: string; eventAt: string | null } | null
): void {
  const c = state.controls;
  if (!c.target || c.snoozing.has(ticket)) return;
  c.snoozing.add(ticket);
  c.snoozeNotes.delete(ticket);
  render();
  const sent = snooze
    ? sendCommand(c.target, host, 'snooze', { ticket, ...snooze })
    : sendCommand(c.target, host, 'wake', { ticket });
  sent
    .then((reply) => {
      if (reply.status === 'refused') {
        c.snoozeNotes.set(ticket, reply.note ?? 'refused');
        return;
      }
      const rest = (state.data.snoozes ?? []).filter(
        (s) => s.ticket !== ticket
      );
      state.data.snoozes = snooze
        ? [
            ...rest,
            {
              ticket,
              kind: snooze.kind,
              event_at: snooze.eventAt,
              at: new Date().toISOString(),
              actor: 'desk'
            }
          ]
        : rest;
    })
    .catch((error: unknown) => {
      c.snoozeNotes.set(
        ticket,
        error instanceof CommandError ? error.message : 'The command failed.'
      );
    })
    .finally(() => {
      c.snoozing.delete(ticket);
      render();
    });
}

/** Asks a host's scheduler to request Copilot's review of a ticket's PR or to merge it; its answer, a note if it refused, then shows beside the button */
function sendPr(
  ticket: string,
  kind: PrCommandKind,
  host: string,
  pr: number
): void {
  const c = state.controls;
  if (!c.target) return;
  const key = prCommandKey(ticket, pr, kind);
  c.prSending.add(key);
  c.prNotes.delete(key);
  render();
  sendCommand(c.target, host, kind, { ticket, pr })
    .then((reply) => {
      if (reply.status === 'refused')
        c.prNotes.set(key, reply.note ?? 'refused');
      // The reply stands in for its row until Realtime delivers it, so the button does not flicker back
      const stored = state.data.deskCommands;
      if (stored && !stored.some((row) => row.id === reply.id)) {
        const at = new Date().toISOString();
        state.data.deskCommands = [
          ...stored,
          {
            id: reply.id,
            at,
            host,
            kind,
            args: { ticket, pr },
            actor: 'desk',
            status: reply.status,
            applied_at: reply.status === 'pending' ? null : at,
            note: reply.note
          }
        ];
      }
    })
    .catch((error: unknown) => {
      c.prNotes.set(
        key,
        error instanceof CommandError ? error.message : 'The command failed.'
      );
    })
    .finally(() => {
      c.prSending.delete(key);
      render();
    });
}

/** Sends one command for a control; the row's own state then arrives over Realtime */
export function sendControl(
  control: Control,
  host: string,
  kind: ControlKind,
  args: CommandArgs = {}
): void {
  const c = state.controls;
  if (!c.target || c.sending.has(control)) return;
  c.sending.add(control);
  c.failed.delete(control);
  c.awaiting.delete(control);
  render();
  sendCommand(c.target, host, kind, args)
    .then((reply) => {
      c.awaiting.set(control, {
        ...reply,
        host,
        kind,
        args,
        at: Date.now()
      });
      // A refused value stays in the stepper to adjust; an accepted one shows once the host reports it
      if (
        reply.status !== 'refused' &&
        (control === 'limit' || control === 'cap')
      )
        delete c.drafts[control];
    })
    .catch((error: unknown) => {
      c.failed.set(control, {
        kind,
        note:
          error instanceof CommandError ? error.message : 'The command failed.'
      });
    })
    .finally(() => {
      c.sending.delete(control);
      render();
    });
}

/** Whether the page has an adapter, for the notice */
export const hasAdapter = (): boolean => adapter !== null;
