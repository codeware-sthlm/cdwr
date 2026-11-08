import { isTauri } from '@tauri-apps/api/core';

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
import { AGENT_AVATAR, CONFIRM_MS } from './constants';
import { type Loader, createLoader } from './load';
import { type Model, model, shipped } from './model';
import { notice } from './notice';
import { renderCapacity } from './render/capacity';
import {
  chartHeight,
  chartKind,
  shippedChart,
  spendChart
} from './render/charts';
import { CAP_RANGE, LIMIT_RANGE } from './render/controls';
import { renderStatus } from './render/header';
import { renderPlatform } from './render/platform';
import {
  renderAlert,
  renderFrozenLabel,
  renderProblems,
  renderUnknownSession,
  updateTicks
} from './render/problems';
import { renderSession } from './render/session';
import { SHEETS } from './render/sheets';
import { renderTiles } from './render/tiles';
import { forgetLabelled, renderWaiting, snoozeUi } from './render/waiting';
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

// ---------- Charts ----------

// Drawn after layout so text stays at its real size at every width
function drawChart(el: HTMLElement): void {
  const { days } = shipped(state.data.closed, new Date());
  const width = el.clientWidth,
    height = chartHeight(el.dataset.h);
  const chart =
    chartKind(el.dataset.chart) === 'spend'
      ? spendChart(spendDays(state.data.usage, days), width, height)
      : shippedChart(days, width, height);
  el.innerHTML = chart.html;
  const tip = el.querySelector<HTMLElement>('.tip');
  if (!tip) return;
  el.onmousemove = (e) => {
    const hit =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('[data-day]')
        : null;
    const t = hit ? chart.tip(Number(hit.dataset.day)) : null;
    if (!hit || !t) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = t.html;
    const box = el.getBoundingClientRect(),
      hb = hit.getBoundingClientRect();
    tip.style.left =
      Math.min(
        box.width - t.edge,
        Math.max(t.edge, hb.left - box.left + hb.width / 2)
      ) + 'px';
    tip.style.top = t.top + 'px';
    tip.hidden = false;
  };
  el.onmouseleave = () => {
    tip.hidden = true;
  };
}
function drawCharts(): void {
  document
    .querySelectorAll<HTMLElement>('[data-chart]')
    .forEach((el) => drawChart(el));
}
let chartWidth = 0;
try {
  new ResizeObserver(() => {
    const w = $('sheet-body').clientWidth;
    if (w && w !== chartWidth) {
      chartWidth = w;
      drawCharts();
    }
  }).observe($('sheet-body'));
} catch {
  // No ResizeObserver: the charts are drawn when a sheet opens
}

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
  setHtml('status', renderStatus(m, state.data.connection));
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
  setHtml(
    'cards',
    (renderUnknownSession(m) || renderSession(m, state.details, now)) +
      renderWaiting(
        m,
        state.details,
        now,
        snoozeUi(m, state.controls, state.ui.snoozedOpen)
      )
  );
  $('capacity').classList.toggle('frozen', Boolean(label));
  $('more').classList.toggle('frozen', Boolean(label));
  // Its ages move by the minute; the cache rewrites it only when the text changed
  if (platform) setHtml('platform', renderPlatform(m, now));
}

function renderMain(): void {
  const now = new Date();
  const m = model(state, now, DESK, WEB);
  forgetLabelled(state.controls.labelled, m.v ? m.toLabel : null);
  renderLive(m, now);
  $('capacity').innerHTML = renderCapacity(m);
  $('more').innerHTML = renderTiles(m, state, now);
  if (state.ui.view === 'platform') setHtml('platform', renderPlatform(m, now));
}

// ---------- View ----------

/** The URL hash that names what is open: a sheet, else the view, else nothing */
function setHash(): void {
  const hash =
    state.ui.openSheet ?? (state.ui.view === 'desk' ? '' : state.ui.view);
  try {
    history.replaceState(
      null,
      '',
      hash ? '#' + hash : location.pathname + location.search
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
  renderMain();
  setHash();
  if (!focus) return;
  if (platform) $('platform-title').focus();
  else document.querySelector<HTMLElement>('.platform')?.focus();
}

// ---------- Sheet ----------

function showSheet(value: string, focus = true): void {
  const id = sheetIdOf(value);
  if (!id) return;
  const now = new Date();
  const w = SHEETS[id];
  state.ui.openSheet = id;
  $('sheet-title').textContent = w.title;
  $('sheet-sub').textContent = w.sub;
  $('sheet-body').innerHTML = w.body(model(state, now, DESK, WEB), state, now);
  $('sheet').hidden = false;
  $('scrim').hidden = false;
  $('sheet-body')
    .querySelectorAll<HTMLElement>('[data-chart]')
    .forEach((el) => drawChart(el));
  setHash();
  if (focus) $('sheet-close').focus();
}
function hideSheet(): void {
  const was = state.ui.openSheet;
  state.ui.openSheet = null;
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

/** Handles a control button's click; true when the click was one */
function clickControl(target: Element): boolean {
  const button = target.closest<HTMLButtonElement>(
    '[data-cmd], [data-step], [data-apply]'
  );
  if (!button) return false;
  const c = state.controls;
  const m = model(state, new Date(), DESK, WEB).controls;
  if (!c.target || !m || button.disabled) return true;
  const { cmd, step, apply } = button.dataset;
  // The render replaces the button; keyboard focus goes back to it, or to the control's next part
  const region = button.closest('[id]');
  const refocus = (...selectors: string[]): void => focusIn(region, selectors);
  if (cmd === 'abandon') {
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
    refocus('[data-cmd="abandon"]');
  } else if (cmd === 'pause' || cmd === 'resume') {
    sendControl('pause', m.host, cmd);
    refocus('[data-cmd="pause"]', '[data-cmd="resume"]');
  } else if (cmd === 'run') {
    sendControl('run', m.host, 'run');
    refocus('[data-cmd="run"]');
  } else if (step) {
    const [control, delta] = step.split(':');
    if (control === 'limit') {
      const next = (m.limit.draft ?? 0) + Number(delta);
      c.drafts.limit = Math.min(
        LIMIT_RANGE.max,
        Math.max(LIMIT_RANGE.min, next)
      );
    } else if (control === 'cap') {
      const next = (m.cap.draft ?? 0) + Number(delta);
      c.drafts.cap = Math.min(CAP_RANGE.max, Math.max(CAP_RANGE.min, next));
    }
    render();
    refocus(
      `[data-step="${step}"]`,
      `[data-apply="${control}"]`,
      `[data-step^="${control}:"]`
    );
  } else if (apply === 'limit' && m.limit.draft !== null) {
    sendControl('limit', m.host, 'limit', { value: m.limit.draft });
    refocus('[data-apply="limit"]', '[data-step^="limit:"]');
  } else if (apply === 'cap' && m.cap.draft !== null) {
    sendControl('cap', m.host, 'cap', { value: m.cap.draft });
    refocus('[data-apply="cap"]', '[data-step^="cap:"]');
  }
  return true;
}

/** Handles a Snooze or Wake button's click; true when the click was one */
function clickSnooze(target: Element): boolean {
  const button = target.closest<HTMLButtonElement>(
    '[data-snooze], [data-wake]'
  );
  if (!button) return false;
  const { snooze, wake, kind, eventAt } = button.dataset;
  const host = model(state, new Date(), DESK, WEB).controls?.host;
  const ticket = snooze ?? wake;
  if (!state.controls.target || !host || !ticket || button.disabled)
    return true;
  const region = button.closest('[id]');
  // The render moves the row; focus goes to its button where it landed, else the fold's summary
  const refocus = (): void =>
    focusIn(region, [
      `[data-snooze="${ticket}"]`,
      `[data-wake="${ticket}"]`,
      'details.snoozed > summary'
    ]);
  sendSnooze(
    ticket,
    host,
    snooze === undefined
      ? null
      : { kind: kind ?? '', eventAt: eventAt || null },
    refocus
  );
  return true;
}

/** Handles a Label button's click; true when the click was one */
function clickLabel(target: Element): boolean {
  const button = target.closest<HTMLButtonElement>('[data-label]');
  if (!button) return false;
  const ticket = button.dataset.label;
  const c = state.controls;
  if (!labeller || !ticket || button.disabled || c.labelling.has(ticket))
    return true;
  const region = button.closest('[id]');
  // Once labelled the button is gone; the row's Snooze, or Wake in the snoozed fold, is nearest
  const refocus = (): void =>
    focusIn(region, [
      `[data-label="${ticket}"]`,
      `[data-snooze="${ticket}"]`,
      `[data-wake="${ticket}"]`
    ]);
  const asked = c.labelConfirm.get(ticket);
  // A double-click is not a confirmation: the second press has to be deliberate
  if (asked !== undefined && Date.now() - asked < DOUBLE_CLICK_MS) return true;
  if (asked === undefined || Date.now() - asked >= CONFIRM_MS) {
    const askedAt = Date.now();
    c.labelConfirm.set(ticket, askedAt);
    c.labelNotes.delete(ticket);
    render();
    refocus();
    // Nothing else redraws the row when this confirmation lapses; one that was consumed or
    // renewed meanwhile is left alone, and the button keeps the focus
    setTimeout(() => {
      if (c.labelConfirm.get(ticket) !== askedAt) return;
      c.labelConfirm.delete(ticket);
      render();
      refocus();
    }, CONFIRM_MS + 50);
    return true;
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
      refocus();
    });
  return true;
}

/** Handles a Copilot review or Merge button's click; true when the click was one */
function clickPr(target: Element): boolean {
  const button = target.closest<HTMLButtonElement>(
    '[data-copilot], [data-merge]'
  );
  if (!button) return false;
  const { copilot, merge, pr, host } = button.dataset;
  const ticket = copilot ?? merge;
  const kind: PrCommandKind = copilot === undefined ? 'merge' : 'copilot';
  const c = state.controls;
  if (!c.target || !ticket || !pr || !host || button.disabled) return true;
  const key = prCommandKey(ticket, pr, kind);
  if (c.prSending.has(key)) return true;
  const region = button.closest('[id]');
  // The render replaces the button; the row's Snooze is nearest once it is gone
  const refocus = (): void =>
    focusIn(region, [
      `[data-${kind}="${ticket}"]`,
      `[data-snooze="${ticket}"]`
    ]);
  if (kind === 'merge') {
    const asked = c.mergeConfirm.get(ticket);
    // A double-click is not a confirmation: the second press has to be deliberate
    if (asked !== undefined && Date.now() - asked < DOUBLE_CLICK_MS)
      return true;
    if (asked === undefined || Date.now() - asked >= CONFIRM_MS) {
      const askedAt = Date.now();
      c.mergeConfirm.set(ticket, askedAt);
      c.prNotes.delete(key);
      render();
      refocus();
      // Nothing else redraws the row when this confirmation lapses; one that was consumed or
      // renewed meanwhile is left alone, and the button keeps the focus
      setTimeout(() => {
        if (c.mergeConfirm.get(ticket) !== askedAt) return;
        c.mergeConfirm.delete(ticket);
        render();
        refocus();
      }, CONFIRM_MS + 50);
      return true;
    }
    c.mergeConfirm.delete(ticket);
  }
  sendPr(ticket, kind, host, Number(pr), refocus);
  return true;
}

// `toggle` doesn't bubble, so it is caught on the way down; a render then keeps the fold as the viewer left it
document.addEventListener(
  'toggle',
  (e) => {
    if (
      e.target instanceof HTMLDetailsElement &&
      e.target.classList.contains('snoozed')
    )
      state.ui.snoozedOpen = e.target.open;
  },
  true
);

document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
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
    else if (action.dataset.action === 'reload') location.reload();
    else if (action.dataset.action === 'copy-row') copyRow(action);
    return;
  }
  if (
    clickControl(e.target) ||
    clickSnooze(e.target) ||
    clickLabel(e.target) ||
    clickPr(e.target)
  )
    return;
  const problem = e.target.closest<HTMLElement>('[data-problem]');
  if (problem) {
    showView('desk', false);
    const card = document.getElementById(problem.dataset.problem ?? '');
    card?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    card?.focus({ preventScroll: true });
    return;
  }
  const v = e.target.closest<HTMLElement>('[data-view]');
  if (v) {
    showView(v.dataset.view === 'platform' ? 'platform' : 'desk');
    return;
  }
  // The fold's summary only opens the fold, never the card's sheet
  if (e.target.closest('details.snoozed > summary')) return;
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
const startHash = (location.hash || '').slice(1);
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
  snooze: { kind: string; eventAt: string | null } | null,
  refocus: () => void
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
      refocus();
    });
}

/** Asks a host's scheduler to request Copilot's review of a ticket's PR or to merge it; its answer, a note if it refused, then shows beside the button */
function sendPr(
  ticket: string,
  kind: PrCommandKind,
  host: string,
  pr: number,
  refocus: () => void
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
      refocus();
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
