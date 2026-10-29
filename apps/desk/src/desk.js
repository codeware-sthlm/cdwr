import { AGENT_AVATAR, RETRACT, STATES } from './desk/constants';
import {
  agentState,
  ideaVerdict,
  model,
  openIssues,
  shipped
} from './desk/model';
import { notice } from './desk/notice';
import { byCreated, parseHandoffs, parseIdea, parsePlan } from './desk/parsers';
import { renderBand } from './desk/render/band';
import {
  chartHeight,
  chartKind,
  shippedChart,
  spendChart
} from './desk/render/charts';
import { renderColumns } from './desk/render/columns';
import { SHEETS } from './desk/render/sheets';
import { renderTiles } from './desk/render/tiles';
import { spendDays } from './desk/spend';
import { bucketsLoaded, createState, isFilter, isSheetId } from './desk/state';

const SERVER = 'Linear';
const TEAM = 'Codeware';
const FIELDS = [
  'title',
  'priority',
  'status',
  'statusType',
  'labels',
  'createdAt',
  'url'
];
const CLOSED_WINDOW = '-P30D';
const IDEA_LABEL = 'agent-idea'; // the Source label of a daily suggestion (COD-579)
const IDEA_WINDOW = '-P60D'; // how far back the accepted and discarded ideas are shown

const state = createState(); // everything the page shows and the viewer chose; survives a settings re-start
let mcp = null; // the data adapter, set by start()

const $ = (id) => document.getElementById(id);

// ---------- Charts ----------

// Drawn after layout so text stays at its real size at every width
function drawChart(el) {
  const { days } = shipped(state.data.closed, new Date());
  const width = el.clientWidth,
    height = chartHeight(el.dataset.h);
  const chart =
    chartKind(el.dataset.chart) === 'spend'
      ? spendChart(spendDays(state.data.usage, days), width, height)
      : shippedChart(days, width, height);
  el.innerHTML = chart.html;
  const tip = el.querySelector('.tip');
  el.onmousemove = (e) => {
    const hit = e.target.closest?.('[data-day]');
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
function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach(drawChart);
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
} catch {}

// ---------- Main view ----------

function renderMain() {
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

function showSheet(id, focus = true) {
  if (!isSheetId(id)) return;
  const now = new Date();
  const w = SHEETS[id];
  state.ui.openSheet = id;
  $('sheet-title').textContent = w.title;
  $('sheet-sub').textContent = w.sub;
  $('sheet-body').innerHTML = w.body(model(state, now), state, now);
  $('sheet').hidden = false;
  $('scrim').hidden = false;
  $('sheet-body').querySelectorAll('[data-chart]').forEach(drawChart);
  try {
    history.replaceState(null, '', '#' + id);
  } catch {}
  if (focus) $('sheet-close').focus();
}
function hideSheet() {
  const was = state.ui.openSheet;
  state.ui.openSheet = null;
  $('sheet').hidden = true;
  $('scrim').hidden = true;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {}
  const el = document.querySelector(`[data-w="${was}"]`);
  (el?.matches('button') ? el : el?.querySelector('.open'))?.focus();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const t = e.target.closest('[data-w]');
  if (t) {
    showSheet(t.dataset.w);
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) {
    if (isFilter(f.dataset.f)) state.ui.filter = f.dataset.f;
    try {
      localStorage.setItem('aq-filter', state.ui.filter);
    } catch {}
    render();
  }
});
document.addEventListener('change', (e) => {
  const s = e.target.closest?.('[data-af]');
  if (!s) return;
  state.ui.actFilter = s.value;
  render();
  document.querySelector('[data-af]')?.focus();
});
$('sheet-close').onclick = hideSheet;
$('scrim').onclick = hideSheet;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.ui.openSheet) hideSheet();
});

// ---------- Render and load ----------

function renderNotice() {
  const n = $('notice');
  const view = notice(state.errors, Boolean(mcp));
  n.hidden = view.hidden;
  if (view.hidden) return;
  n.className = 'notice' + (view.severe ? ' err' : '');
  n.textContent = view.text;
}

function render() {
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
    : mcp
      ? 'Loading…'
      : 'Waiting for settings';
  renderNotice();
}

const prFromAttachments = (atts) => {
  for (const a of atts || []) {
    const n = String(a.url || '').match(
      /^https:\/\/github\.com\/codeware-sthlm\/cdwr\/pull\/(\d+)/
    )?.[1];
    if (n) return Number(n);
  }
  return null;
};
async function loadDetails() {
  const { ideas, runs } = state.data;
  const ids = new Set(
    openIssues(state.data)
      .filter((i) => agentState(i))
      .map((i) => i.id)
  );
  for (const i of ideas || [])
    if (ideaVerdict(i) === 'to decide') ids.add(i.id);
  const v = runs?.qv;
  if (v)
    for (const x of [
      ...v.next,
      ...v.parked,
      ...v.table.before,
      ...v.table.after
    ])
      ids.add(x.ticket);
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'get_issue',
          { id, includeRelations: true },
          { cache: { staleTime: 60000 } }
        );
        const p = r.payload || {};
        state.details.set(id, {
          ...parsePlan(p.description),
          idea: parseIdea(p.description),
          blockedBy: (p.relations?.blockedBy || []).map((b) => b.id),
          pr: prFromAttachments(p.attachments)
        });
        state.errors.delete('detail:' + id);
      } catch (e) {
        state.errors.set('detail:' + id, e);
      }
    })
  );
  const handoffIds = v
    ? v.table.after.filter((x) => x.kind === 'handoffs').map((x) => x.ticket)
    : [];
  await Promise.all(
    handoffIds.map(async (id) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'list_comments',
          { issueId: id, limit: 100, orderBy: 'createdAt' },
          { cache: { staleTime: 30000 } }
        );
        state.liveHandoffs.set(id, parseHandoffs(r.payload?.comments));
        state.errors.delete('handoffs:' + id);
      } catch (e) {
        state.errors.set('handoffs:' + id, e);
      }
    })
  );
  // The discard word of a cancelled idea is its last comment, as the suggest-improvement skill reads it
  const cancelled = (ideas || []).filter(
    (i) => i.statusType === 'canceled' && !state.ideaReasons.has(i.id)
  );
  await Promise.all(
    cancelled.map(async (i) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'list_comments',
          { issueId: i.id, limit: 50, orderBy: 'createdAt' },
          { cache: { staleTime: 600000 } }
        );
        const lastComment = (r.payload?.comments || [])
          .slice()
          .sort(byCreated)
          .pop();
        state.ideaReasons.set(
          i.id,
          lastComment
            ? String(lastComment.body || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80)
            : ''
        );
        state.errors.delete('reason:' + i.id);
      } catch (e) {
        state.errors.set('reason:' + i.id, e);
      }
    })
  );
  render();
}

let detailTimer = null;
function scheduleDetails() {
  clearTimeout(detailTimer);
  detailTimer = setTimeout(loadDetails, 150);
}

function watchAll() {
  // The "runs", "usage" and "activity" payloads arrive in the shapes the page reads (see the declarations above)
  const opts = { refetchInterval: 120000, cache: { staleTime: 30000 } };
  for (const s of STATES) {
    mcp.watchTool(
      SERVER,
      'list_issues',
      { team: TEAM, state: s, limit: 250, fields: FIELDS },
      (ev) => {
        if (ev.type === 'data') {
          state.data.buckets.set(s, ev.result.payload?.issues || []);
          state.data.storedAt = ev.result.cache?.storedAt || Date.now();
          state.errors.delete('list:' + s);
          render();
          scheduleDetails();
        } else {
          state.errors.set('list:' + s, ev.error);
          if (RETRACT.includes(ev.error.code)) state.data.buckets.delete(s);
          render();
        }
      },
      opts
    );
  }
  mcp.watchTool(
    'Supabase',
    'runs',
    {},
    (ev) => {
      if (ev.type === 'data') {
        state.data.runs = ev.result.payload;
        state.errors.delete('runs');
        scheduleDetails();
      } else {
        state.errors.set('runs', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.runs = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    'Supabase',
    'usage',
    {},
    (ev) => {
      if (ev.type === 'data') {
        state.data.usage = ev.result.payload;
        state.errors.delete('usage');
      } else {
        state.errors.set('usage', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.usage = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    'Supabase',
    'activity',
    {},
    (ev) => {
      if (ev.type === 'data') {
        state.data.activity = ev.result.payload;
        state.errors.delete('activity');
      } else {
        state.errors.set('activity', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.activity = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    SERVER,
    'list_issues',
    {
      team: TEAM,
      label: IDEA_LABEL,
      updatedAt: IDEA_WINDOW,
      limit: 100,
      fields: [...FIELDS, 'completedAt', 'canceledAt']
    },
    (ev) => {
      if (ev.type === 'data') {
        state.data.ideas = ev.result.payload?.issues || [];
        state.errors.delete('ideas');
        render();
        scheduleDetails();
      } else {
        state.errors.set('ideas', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.ideas = null;
        render();
      }
    },
    opts
  );
  mcp.watchTool(
    SERVER,
    'list_issues',
    {
      team: TEAM,
      state: 'completed',
      updatedAt: CLOSED_WINDOW,
      limit: 100,
      fields: [...FIELDS, 'completedAt']
    },
    (ev) => {
      if (ev.type === 'data') {
        state.data.closed = ev.result.payload?.issues || [];
        state.errors.delete('list:completed');
        render();
      } else {
        state.errors.set('list:completed', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.closed = null;
        render();
      }
    },
    opts
  );
}

$('refresh').onclick = async () => {
  if (!mcp) return;
  $('fresh').textContent = 'Refreshing…';
  try {
    await Promise.all([mcp.invalidate(SERVER), mcp.invalidate('Supabase')]);
  } catch {}
  state.details.clear();
  state.liveHandoffs.clear();
  state.ideaReasons.clear();
  loadDetails();
};
try {
  const f = localStorage.getItem('aq-filter');
  if (isFilter(f)) state.ui.filter = f;
} catch {}

document.querySelectorAll('[data-agent-avatar]').forEach((img) => {
  img.src = AGENT_AVATAR;
});
render();
const startHash = (location.hash || '').slice(1);
if (isSheetId(startHash)) showSheet(startHash, false);

// adapter: { watchTool(server, tool, args, cb, opts), callTool(server, tool, args, opts), invalidate(server) }
export function start(adapter) {
  mcp = adapter;
  if (mcp) watchAll();
  render();
}
