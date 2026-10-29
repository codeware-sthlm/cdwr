import type { Adapter } from '../data';

import { AGENT_AVATAR } from './constants';
import { type Loader, createLoader } from './load';
import { model, shipped } from './model';
import { notice } from './notice';
import { renderBand } from './render/band';
import {
  chartHeight,
  chartKind,
  shippedChart,
  spendChart
} from './render/charts';
import { renderColumns } from './render/columns';
import { SHEETS } from './render/sheets';
import { renderTiles } from './render/tiles';
import { spendDays } from './spend';
import { bucketsLoaded, createState, isFilter, isSheetId } from './state';

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
  const band = renderBand(m, now);
  $('now').className = band.className;
  $('now').innerHTML = band.html;
  const cols = renderColumns(m, state);
  $('col-before').classList.toggle('has', cols.waiting);
  $('col-before').innerHTML = cols.before;
  $('col-next').innerHTML = cols.next;
  $('col-after').innerHTML = cols.after;
  $('more').innerHTML = renderTiles(m, state, now);
}

// ---------- Sheet ----------

function showSheet(id: string, focus = true): void {
  if (!isSheetId(id)) return;
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
  try {
    history.replaceState(null, '', '#' + id);
  } catch {
    // Some webviews refuse to change the URL
  }
  if (focus) $('sheet-close').focus();
}
function hideSheet(): void {
  const was = state.ui.openSheet;
  state.ui.openSheet = null;
  $('sheet').hidden = true;
  $('scrim').hidden = true;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    // Some webviews refuse to change the URL
  }
  const el = document.querySelector<HTMLElement>(`[data-w="${was}"]`);
  (el?.matches('button')
    ? el
    : el?.querySelector<HTMLElement>('.open')
  )?.focus();
}

document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('a')) return;
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.ui.openSheet) hideSheet();
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
if (isSheetId(startHash)) showSheet(startHash, false);

/** Starts the page on a data adapter; called again with a new one when the settings change */
export function start(next: Adapter | null): void {
  adapter = next;
  loader?.stop();
  loader = next ? createLoader({ adapter: next, state, render }) : null;
  loader?.watchAll();
  render();
}
