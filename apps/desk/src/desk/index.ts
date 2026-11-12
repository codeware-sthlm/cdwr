import { isTauri } from '@tauri-apps/api/core';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';

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
import { BeforeSheet, type WaitActions } from './components/before';
import { Capacity } from './components/capacity';
import { Cards } from './components/cards';
import { ShippedChart, SpendChart } from './components/charts';
import { Platform, type PlatformActions } from './components/platform';
import { Status } from './components/status';
import { Tiles } from './components/tiles';
import { AGENT_AVATAR, CONFIRM_MS } from './constants';
import { type Loader, createLoader } from './load';
import { type ControlsModel, type Model, model, shipped } from './model';
import { notice } from './notice';
import { chartHeight, chartKind } from './render/charts';
import { CAP_RANGE, LIMIT_RANGE } from './render/controls';
import {
  renderAlert,
  renderFrozenLabel,
  renderProblems,
  updateTicks
} from './render/problems';
import { SHEETS } from './render/sheets';
import { forgetLabelled } from './render/waiting';
import { spendDays } from './spend';
import {
  type Connection,
  type View,
  bucketsLoaded,
  createState,
  emptyControls,
  isFilter,
  sheetIdOf,
  viewOf
} from './state';

// This build, and whether it is the web desk the NUC serves rather than the Mac app: that
// decides which workflow's build main is compared with
const DESK = deskSha();
const WEB = !isTauri();

const state = createState(); // everything the page shows and the viewer chose; survives a settings re-start
let adapter: Adapter | null = null; // set by start()
let loader: Loader | null = null;
let labeller: ((ticket: string) => Promise<void>) | null = null; // set by setLabeller()
/** A second press this soon after the first is a double-click, not a confirmation */
const DOUBLE_CLICK_MS = 300;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el;
};

// The header's status pill, the two cards, the capacity row, the tiles and the Platform view are
// React; the rest of the page is still written as HTML
const statusRoot = createRoot($('status'));
const cardsRoot = createRoot($('cards'));
const capacityRoot = createRoot($('capacity'));
const tilesRoot = createRoot($('more'));
const platformRoot = createRoot($('platform'));

// ---------- Main view ----------

// Skips a write that changes nothing, so a ticking page keeps its selection and a live region its place
const written = new Map<string, string>();
function setHtml(id: string, html: string): void {
  if (written.get(id) === html) return;
  written.set(id, html);
  $(id).innerHTML = html;
}

let shownProblems = false;

/** The parts that show the problems and the time they have lasted; redrawn every second while any are */
function renderLive(m: Model, now: Date): void {
  shownProblems = m.problems.length > 0;
  const platform = state.ui.view === 'platform';
  statusRoot.render(
    createElement(Status, {
      m,
      connection: state.data.connection,
      onView: (view) => showView(view)
    })
  );
  const alert = renderAlert(m);
  setHtml('alert', alert);
  $('alert').hidden = !alert;
  const problems = renderProblems(m);
  setHtml('problems', problems);
  updateTicks($('problems'), now);
  $('problems').hidden = platform || !problems;
  const label = renderFrozenLabel(m);
  $('frozen-label').textContent = label;
  $('frozen-label').hidden = platform || !label;
  cardsRoot.render(
    createElement(Cards, {
      m,
      details: state.details,
      now,
      snoozedOpen: state.ui.snoozedOpen,
      onSnoozedOpen: (open) => {
        state.ui.snoozedOpen = open;
        render();
      }
    })
  );
  $('capacity').classList.toggle('frozen', Boolean(label));
  $('more').classList.toggle('frozen', Boolean(label));
  // Its ages move by the minute
  if (platform)
    platformRoot.render(
      createElement(Platform, { m, now, actions: platformActions })
    );
}

function renderMain(): void {
  const now = new Date();
  const m = model(state, now, DESK, WEB);
  forgetLabelled(state.controls.labelled, m.v ? m.toLabel : null);
  renderLive(m, now);
  capacityRoot.render(
    createElement(Capacity, {
      m,
      onSheet: (id) => showSheet(id),
      onView: (view) => showView(view),
      pause: pauseQueue,
      run: runNow
    })
  );
  tilesRoot.render(
    createElement(Tiles, {
      m,
      state,
      now,
      onSheet: (id) => showSheet(id)
    })
  );
}

// ---------- View ----------

/** The URL hash that names what is open: a sheet, else the view, else nothing */
function setHash(): void {
  const hash =
    state.ui.openSheet ?? (state.ui.view === 'desk' ? '' : state.ui.view);
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
function showView(view: View, focus = true): void {
  state.ui.view = view;
  const platform = view === 'platform';
  $('cards').hidden = platform;
  $('capacity').hidden = platform;
  $('more').hidden = platform;
  $('platform').hidden = !platform;
  // A render is asynchronous: flushed here, the view's title exists before it takes focus
  flushSync(renderMain);
  setHash();
  if (!focus) return;
  if (platform) $('platform-title').focus();
  else document.querySelector<HTMLElement>('.platform')?.focus();
}

// ---------- Sheet ----------

// The Waiting on you sheet is React and keeps its root while it is open, so a render updates it in
// place and keeps focus; every other sheet is still written as HTML
let sheetRoot: Root | null = null;

function unmountSheet(): void {
  sheetRoot?.unmount();
  sheetRoot = null;
}

// An HTML sheet's charts are React roots on its `[data-chart]` slots. While a render writes the
// same HTML the body is left alone and the roots re-render with new data, so a hover survives it.
let sheetHtml: string | null = null;
let chartRoots: Root[] = [];

function unmountCharts(): void {
  for (const root of chartRoots) root.unmount();
  chartRoots = [];
  sheetHtml = null;
}

/** Writes an HTML sheet's body when it changed, then renders its charts */
function writeSheet(html: string): void {
  const body = $('sheet-body');
  if (html !== sheetHtml) {
    unmountCharts();
    body.innerHTML = html;
    sheetHtml = html;
    chartRoots = Array.from(
      body.querySelectorAll<HTMLElement>('[data-chart]'),
      (el) => createRoot(el)
    );
  }
  if (!chartRoots.length) return;
  const { days } = shipped(state.data.closed, new Date());
  body.querySelectorAll<HTMLElement>('[data-chart]').forEach((el, n) => {
    const height = chartHeight(el.dataset.h);
    chartRoots[n]?.render(
      chartKind(el.dataset.chart) === 'spend'
        ? createElement(SpendChart, {
            days: spendDays(state.data.usage, days),
            height
          })
        : createElement(ShippedChart, { days, height })
    );
  });
}

function showSheet(value: string, focus = true): void {
  const id = sheetIdOf(value);
  if (!id) return;
  const now = new Date();
  const w = SHEETS[id];
  const m = model(state, now, DESK, WEB);
  state.ui.openSheet = id;
  $('sheet-title').textContent = w.title;
  $('sheet-sub').textContent = w.sub;
  if (id === 'before') {
    if (!sheetRoot) {
      unmountCharts();
      $('sheet-body').innerHTML = '';
      sheetRoot = createRoot($('sheet-body'));
    }
    sheetRoot.render(
      createElement(BeforeSheet, {
        m,
        state,
        now,
        open: state.ui.snoozedOpen,
        onOpenChange: (open) => {
          state.ui.snoozedOpen = open;
          render();
        },
        actions: waitActions
      })
    );
  } else {
    unmountSheet();
    writeSheet(w.body(m, state, now));
  }
  $('sheet').hidden = false;
  $('scrim').hidden = false;
  setHash();
  if (focus) $('sheet-close').focus();
}
function hideSheet(): void {
  const was = state.ui.openSheet;
  state.ui.openSheet = null;
  unmountSheet();
  unmountCharts();
  $('sheet').hidden = true;
  $('scrim').hidden = true;
  setHash();
  const el = document.querySelector<HTMLElement>(`[data-w="${was}"]`);
  (el?.matches('button')
    ? el
    : el?.querySelector<HTMLElement>('.open')
  )?.focus();
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

function copyRow(button: Element): void {
  const raw = button.closest('.problem')?.querySelector('.raw');
  if (!raw) return;
  const text = raw.textContent ?? '';
  if (!navigator.clipboard) {
    selectText(raw);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => selectText(raw));
}

/** The first enabled, visible match in the region, for focus after a render replaced the node */
function focusIn(region: Element | null, selectors: string[]): void {
  const root = region?.id ? document.getElementById(region.id) : null;
  for (const sel of selectors) {
    const found = Array.from(
      (root ?? document).querySelectorAll<HTMLButtonElement>(sel)
    ).find((el) => !el.disabled && el.offsetParent !== null);
    if (found) {
      found.focus();
      return;
    }
  }
}

/** The controls as the model sees them now; null when the desk cannot send */
function controlsNow(): ControlsModel | null {
  return state.controls.target
    ? model(state, new Date(), DESK, WEB).controls
    : null;
}

// The controls' actions, shared by the capacity row and the Platform view

function pauseQueue(kind: 'pause' | 'resume'): void {
  const m = controlsNow();
  if (m) sendControl('pause', m.host, kind);
}

function runNow(): void {
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
const platformActions: PlatformActions = {
  desk: () => showView('desk'),
  problem: showProblem,
  sheet: (id) => showSheet(id),
  pause: pauseQueue,
  run: runNow,
  step: stepDraft,
  apply: applyDraft
};

/** Handles the abandon button's click, the one control still written as HTML; true when the click was one */
function clickControl(target: Element): boolean {
  const button = target.closest<HTMLButtonElement>('[data-cmd="abandon"]');
  if (!button) return false;
  const c = state.controls;
  const m = controlsNow();
  if (!m || button.disabled) return true;
  // The render replaces the button; keyboard focus goes back to it
  const region = button.closest('[id]');
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
  focusIn(region, ['[data-cmd="abandon"]']);
  return true;
}

/** A Snooze or Wake click on a waiting row: `snooze` says what to snooze it on, null wakes it */
function clickSnooze(
  ticket: string,
  snooze: { kind: string; eventAt: string | null } | null
): void {
  const host = model(state, new Date(), DESK, WEB).controls?.host;
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

document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  // The Platform view, the capacity row and the tiles are React and handle their own clicks
  if (e.target.closest('#platform, #capacity, #more')) return;
  if (e.target.closest('[data-see-problems]')) {
    e.preventDefault();
    // The alert shows on the Platform view too, where the problems are hidden
    if (state.ui.view !== 'desk') showView('desk', false);
    $('problems').scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth'
    });
    return;
  }
  if (e.target.closest('a')) return;
  const action = e.target.closest<HTMLElement>('[data-action]');
  if (action) {
    if (action.dataset.action === 'reconnect') void adapter?.reconnect();
    else if (action.dataset.action === 'reload') window.location.reload();
    else if (action.dataset.action === 'copy-row') copyRow(action);
    return;
  }
  if (clickControl(e.target)) return;
  const problem = e.target.closest<HTMLElement>('[data-problem]');
  if (problem) {
    showProblem(problem.dataset.problem ?? '');
    return;
  }
  const v = e.target.closest<HTMLElement>('[data-view]');
  if (v) {
    showView(v.dataset.view === 'platform' ? 'platform' : 'desk');
    return;
  }
  // The fold's trigger only opens the fold, never the card's sheet
  if (e.target.closest('.snoozed-summary')) return;
  const t = e.target.closest<HTMLElement>('[data-w]');
  if (t?.dataset.w) {
    showSheet(t.dataset.w);
    return;
  }
  const f = e.target.closest<HTMLElement>('[data-f]');
  if (f) {
    const filter = f.dataset.f;
    if (isFilter(filter)) state.ui.filter = filter;
    try {
      localStorage.setItem('aq-filter', state.ui.filter);
    } catch {
      // Storage is unavailable: the filter lasts until the page closes
    }
    render();
  }
});
document.addEventListener('change', (e) => {
  const s = e.target instanceof Element ? e.target.closest('[data-af]') : null;
  if (!(s instanceof HTMLSelectElement)) return;
  state.ui.actFilter = s.value;
  render();
  document.querySelector<HTMLElement>('[data-af]')?.focus();
});
$('sheet-close').onclick = hideSheet;
$('scrim').onclick = hideSheet;

// Drag the bottom sheet down to close it; the same breakpoint as the CSS
const PHONE = '(max-width: 600px)';
const DRAG_CLOSE_PX = 80;
const DRAG_TAP_PX = 4; // a pointer that moved further than this was dragging, not tapping
{
  const sheet = $('sheet');
  let startY: number | null = null;
  let dy = 0;
  let dragged = false; // the click that ends a drag must not close the sheet as a tap
  // A plain tap on the handle closes; the click after a drag is ignored
  $('sheet-handle').onclick = () => {
    if (dragged) {
      dragged = false;
      return;
    }
    hideSheet();
  };
  const onDown = (e: PointerEvent): void => {
    if (!window.matchMedia(PHONE).matches) return;
    if (e.target instanceof Element && e.target.closest('#sheet-close')) return;
    startY = e.clientY;
    dy = 0;
    dragged = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    if (dy > DRAG_TAP_PX) dragged = true;
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const finish = (close: boolean): void => {
    if (startY === null) return;
    startY = null;
    dy = 0;
    sheet.style.transform = '';
    if (close) hideSheet();
  };
  const onUp = (): void => finish(dy > DRAG_CLOSE_PX);
  const onCancel = (): void => finish(false);
  for (const el of [
    $('sheet-handle'),
    sheet.querySelector<HTMLElement>('.sheet-head')
  ]) {
    if (!el) continue;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.ui.openSheet) hideSheet();
  else if (state.ui.view === 'platform') showView('desk');
});

// ---------- Render and load ----------

function renderNotice(): void {
  const n = $('notice');
  const view = notice(state.errors, Boolean(adapter));
  n.hidden = view.hidden;
  if (view.hidden) return;
  n.className = 'notice' + (view.severe ? ' err' : '');
  n.textContent = view.text;
}

function render(): void {
  renderMain();
  if (state.ui.openSheet) {
    const scroll = $('sheet-body').scrollTop;
    showSheet(state.ui.openSheet, false);
    $('sheet-body').scrollTop = scroll;
  }
  const loaded = bucketsLoaded(state.data);
  $('fresh').textContent = loaded
    ? 'Updated ' +
      new Date(state.data.storedAt || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : adapter
      ? 'Loading…'
      : 'Waiting for settings';
  renderNotice();
}

// The timers and the connection's grace move without an event. A healthy page checks every 15th tick: a host can go silent without one.
const QUIET_TICKS = 15;
let ticks = 0;
setInterval(() => {
  if (document.hidden) return;
  ticks += 1;
  if (state.data.connection.live && !shownProblems && ticks % QUIET_TICKS !== 0)
    return;
  const now = new Date();
  renderLive(model(state, now, DESK, WEB), now);
}, 1000);

$('refresh').onclick = () => {
  if (!loader) return;
  $('fresh').textContent = 'Refreshing…';
  void loader.refresh();
};
try {
  const f = localStorage.getItem('aq-filter');
  if (isFilter(f)) state.ui.filter = f;
} catch {
  // Storage is unavailable: the filter starts at its default
}

document
  .querySelectorAll<HTMLImageElement>('[data-agent-avatar]')
  .forEach((img) => {
    img.src = AGENT_AVATAR;
  });
render();
const startHash = (window.location.hash || '').slice(1);
if (viewOf(startHash)) showView('platform', false);
else {
  const startSheet = sheetIdOf(startHash);
  if (startSheet) showSheet(startSheet, false);
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
