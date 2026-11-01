import type { Adapter } from '../data';
import type { IssueEventRow } from '../supabase';

import { AGENT_AVATAR } from './constants';
import { type Loader, createLoader } from './load';
import { model, shipped } from './model';
import { notice } from './notice';
import { renderCapacity } from './render/capacity';
import {
  chartHeight,
  chartKind,
  shippedChart,
  spendChart
} from './render/charts';
import { renderStatus } from './render/header';
import { renderPlatform } from './render/platform';
import { renderSession } from './render/session';
import { SHEETS } from './render/sheets';
import { renderTiles } from './render/tiles';
import { renderWaiting } from './render/waiting';
import { spendDays } from './spend';
import {
  type View,
  bucketsLoaded,
  createState,
  isFilter,
  sheetIdOf,
  viewOf
} from './state';

const state = createState(); // everything the page shows and the viewer chose; survives a settings re-start
let adapter: Adapter | null = null; // set by start()
let loader: Loader | null = null;

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

function renderMain(): void {
  const now = new Date();
  const m = model(state, now);
  $('status').innerHTML = renderStatus(m, state.data.connection);
  $('cards').innerHTML = renderSession(m, now) + renderWaiting(m, now);
  $('capacity').innerHTML = renderCapacity(m);
  $('more').innerHTML = renderTiles(m, state, now);
  if (state.ui.view === 'platform')
    $('platform').innerHTML = renderPlatform(m, now);
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
  $('sheet-body').innerHTML = w.body(model(state, now), state, now);
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

document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('a')) return;
  const v = e.target.closest<HTMLElement>('[data-view]');
  if (v) {
    showView(v.dataset.view === 'platform' ? 'platform' : 'desk');
    return;
  }
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
  connection: { retries: number; upSince: number | null }
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
