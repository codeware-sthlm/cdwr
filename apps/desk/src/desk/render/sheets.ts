import type { Issue } from '../../linear';
import {
  ACTIVITY_STALE_MIN,
  AGENT_AVATAR,
  ROLES,
  SHIP_DAYS
} from '../constants';
import {
  ageText,
  dayLabel,
  esc,
  inline,
  mtok,
  plural,
  txt,
  usd
} from '../format';
import {
  type Model,
  type TicketRef,
  activityMissing,
  agentState,
  shipped
} from '../model';
import {
  type TicketCost,
  perTicketAverage,
  spendStats,
  ticketCosts,
  tokenTotals,
  unattributedTotal
} from '../spend';
import type { DeskState, Detail } from '../state';

import { chartSlot } from './charts';
import { empty, idLink, isTicketId, linkIds, pvMore } from './html';

// The sheets still written as HTML, until they move to components. A body is a pure function of the model and the state.

const PRIO: ReadonlyMap<number, string> = new Map([
  [1, 'Urgent'],
  [2, 'High'],
  [3, 'Medium'],
  [4, 'Low'],
  [0, 'None']
]);
const PRIO_MARK: ReadonlyMap<number, string> = new Map([
  [1, '!!!'],
  [2, '▲▲'],
  [3, '▲'],
  [4, '▽'],
  [0, '–']
]);

type ItemOpts = {
  /** The row's class: an Agent state or `plain` */
  state?: string;
  rank?: number | string;
  /** HTML shown as the row's meta line, ahead of the next step */
  note?: string;
  showNext?: boolean;
  /** HTML at the row's right edge */
  side?: string;
};

const itemHTML = (
  details: ReadonlyMap<string, Detail>,
  i: TicketRef,
  opts: ItemOpts = {}
): string => {
  const d = details.get(i.id);
  const prog =
    d && d.steps
      ? `<div class="meta"><div class="bar" aria-hidden="true"><i style="width:${Math.round((d.done / d.steps) * 100)}%"></i></div><span>${d.done}/${d.steps} steps</span></div>`
      : '';
  const next = opts.note
    ? `<div class="meta">${opts.note}</div>`
    : d?.next && opts.showNext
      ? `<div class="next">${linkIds(txt(d.next))}</div>`
      : '';
  const prio = i.priority?.value ?? 0;
  const prioName = PRIO.get(prio) ?? PRIO.get(0);
  return `<li class="item ${opts.state || ''}">
    <span class="rank">${esc(opts.rank ?? '')}</span>
    <div class="main">
      <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
      ${i.status ? `<div class="meta"><span class="prio" title="${prioName}">${PRIO_MARK.get(prio) ?? PRIO_MARK.get(0)} ${prioName}</span><span>· ${esc(i.status)}</span></div>` : ''}
      ${prog}${next}
    </div>
    <span class="side">${opts.side ?? ''}</span>
  </li>`;
};

// ---------- Activity ----------

const NO_ACTIVITY =
  'No activity yet. The scheduler publishes it after its next run.';

const actorHTML = (a: string): string =>
  a === 'agent'
    ? `<span class="tag agent"><img class="av" src="${AGENT_AVATAR}" alt="">agent</span>`
    : a === 'scheduler'
      ? `<span class="tag ${a}">${a}</span>`
      : a === 'unknown'
        ? `<span class="actor-unknown">unknown</span>`
        : esc(a);

const changeHTML = (c: string): string =>
  linkIds(inline(c.replace(/\*\*/g, '')));

const activityTable = (
  rows: readonly {
    when: string;
    ticket: string;
    actor: string;
    change: string;
  }[]
): string =>
  `<div class="tblwrap"><table class="act"><thead><tr><th>When</th><th>Ticket</th><th>Actor</th><th>Change</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td><time>${esc(r.when)}</time></td><td>${idLink(r.ticket)}</td><td>${actorHTML(r.actor)}</td><td>${changeHTML(r.change)}</td></tr>`
    )
    .join('')}</tbody></table></div>`;

/** The Updated line, in the warning colour once it's older than ACTIVITY_STALE_MIN: the scheduler stops while the Mac sleeps */
const activityHead = (m: Model, header: string): string => {
  const age = m.activityAge;
  const warning =
    age !== null && age > ACTIVITY_STALE_MIN
      ? "The scheduler hasn't published for " +
        esc(ageText(age)) +
        '. It stops while the Mac sleeps.'
      : '';
  return `<span class="${warning ? 'stale' : ''}" title="${warning}">${esc(header)}</span>`;
};

export const renderActivity = (m: Model, state: DeskState): string => {
  const { activity } = state.data;
  if (!activity) return empty("The activity table hasn't loaded yet.");
  if (activityMissing(activity)) return empty(NO_ACTIVITY);
  const tickets = [
    ...new Set(activity.rows.map((r) => r.ticket).filter(isTicketId))
  ].sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  // A filter on a ticket that has left the window shows everything
  const picked = tickets.includes(state.ui.actFilter)
    ? state.ui.actFilter
    : 'all';
  const rows =
    picked === 'all'
      ? activity.rows
      : activity.rows.filter((r) => r.ticket === picked);
  return `<div class="act-bar"><label>Ticket <select data-af aria-label="Filter by ticket"><option value="all"${picked === 'all' ? ' selected' : ''}>All</option>${tickets.map((t) => `<option value="${esc(t)}"${t === picked ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label><span>${plural(rows.length, 'event', 'events')}</span></div>
    ${activity.dropped ? `<p class="rule">${esc(activity.dropped)}</p>` : ''}
    ${rows.length ? activityTable(rows) : empty('No events for this ticket in the window.')}
    <p class="rule">From Linear's issue history of tickets that carried an <code>agent:*</code> label, and the scheduler's own runs. The agent writes as the queue's own Linear app user, and those changes say <b>agent</b>; so do older comments starting <code>**Agent</code>, from when it wrote as Håkan. Other changes carry their author's name. Updated ${activityHead(m, activity.header)}.</p>`;
};

// ---------- Closed, spend, cost per ticket ----------

export const renderShipped = (state: DeskState, now: Date): string => {
  const s = shipped(state.data.closed, now);
  const daysWith = s.days.filter((d) => d.items.length).reverse();
  const listHTML = daysWith
    .map(
      (d) =>
        `<div class="group"><h3>${esc(dayLabel(d.key))} · ${d.items.length}</h3><ul>${d.items.map((i) => itemHTML(state.details, i, { state: 'plain' })).join('')}</ul></div>`
    )
    .join('');
  return `<div class="pv-stats"><div><b>${s.total}</b><span>last ${SHIP_DAYS} days</span></div><div><b>${s.week}</b><span>last 7 days</span></div></div>
    ${chartSlot('shipped')}
    ${listHTML || empty('No agent ticket closed in the last ' + SHIP_DAYS + ' days.')}
    <p class="rule">Tickets that carried an agent label when they closed, by the day they closed.</p>`;
};

const legendHTML = (): string =>
  `<div class="legend">${ROLES.map((r) => `<span><i class="seg-${r}" aria-hidden="true"></i>${r}</span>`).join('')}</div>`;

const hbarsHTML = (rows: readonly TicketCost[], max: number): string => {
  const top = Math.max(1, ...rows.map((r) => r.total));
  return `<div class="hbars">${rows
    .slice(0, max)
    .map((r) => {
      const title =
        `${r.i.id}: ` + ROLES.map((k) => `${k} ${usd(r[k], 2)}`).join(', ');
      return `<div class="hbar" title="${esc(title)}"><a class="id" href="${esc(r.i.url)}" target="_blank" rel="noopener">${esc(r.i.id)}</a>
      <span class="track" aria-hidden="true">${ROLES.filter((k) => r[k] > 0)
        .map(
          (k) => `<i class="seg-${k}" style="width:${(r[k] / top) * 100}%"></i>`
        )
        .join('')}</span>
      <b>${usd(r.total)}</b></div>`;
    })
    .join('')}</div>${pvMore(rows.length - max)}`;
};

const tableHTML = (
  head: readonly string[],
  rows: readonly (readonly string[])[]
): string =>
  `<div class="tblwrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const noUsage = (): string =>
  empty(
    'No usage yet. The scheduler writes the <code>usage</code> table at most once an hour once <code>cdwr agent install</code> has run with COD-533.'
  );

const pct = (a: number, b: number): string =>
  b ? Math.round((a / b) * 100) + '%' : '–';

type Usage = NonNullable<DeskState['data']['usage']>;

const renderSpend = (
  usage: Usage,
  days: ReturnType<typeof shipped>['days'],
  perTicket: number | null
): string => {
  const s = spendStats(usage, days);
  const tok = tokenTotals(usage.models);
  const unattributed = unattributedTotal(usage);
  return `<div class="pv-stats">
      <div><b>${usd(s.total)}</b><span>last ${SHIP_DAYS} days</span></div>
      <div><b>${usd(s.week)}</b><span>last 7 days</span></div>
      <div><b>${usd(perTicket)}</b><span>per closed ticket</span></div>
      <div><b>${pct(tok.cacheRead, tok.all)}</b><span>of tokens are cache reads</span></div>
      <div><b>${pct(unattributed, usage.total)}</b><span>unattributed</span></div>
    </div>
    ${chartSlot('spend')}
    <div class="group"><h3>By model</h3>${tableHTML(
      ['Model', 'Cost', 'Output', 'Cache read', 'Cache write', 'Input'],
      usage.models
        .slice()
        .sort((a, b) => b.cost - a.cost)
        .map((m) => [
          esc(m.model),
          usd(m.cost, 2),
          mtok(m.output),
          mtok(m.cacheRead),
          mtok(m.cacheWrite),
          mtok(m.input)
        ])
    )}</div>
    <div class="group"><h3>What moves it</h3><ul class="knobs">
      <li><b>Model per role</b><span>Fable 5.1 costs 2.5× Opus 5.5 per token; the orchestrator runs on whatever the session uses, the implementer on Sonnet.</span></li>
      <li><b>Session length</b><span>Every turn re-reads the conversation as cache reads, so a long session grows roughly with its square. <code>/clear</code> between tickets and compaction between steps cut it.</span></li>
      <li><b><code>AGENT_QUEUE_BUDGET_USD</code></b><span>Caps one planning run (default 5). A run that hits it shows as <code>cap</code> on the scheduler.</span></li>
      <li><b><code>AGENT_QUEUE_IMPLEMENT_BUDGET_USD</code> and the daily cap</b><span>A session the scheduler starts stops at $15, and these sessions stop launching for the day at $40 (<code>AGENT_QUEUE_IMPLEMENT_CAP_USD</code>).</span></li>
      <li><b>Run interval</b><span>Idle runs start no model, so the interval only matters when there's something to plan.</span></li>
    </ul></div>
    <div class="group"><h3>Per day</h3>${tableHTML(
      ['Day', ...ROLES, 'Total'],
      s.days
        .filter((d) => d.total)
        .reverse()
        .map((d) => [
          esc(dayLabel(d.key)),
          ...ROLES.map((r) => usd(d[r], 2)),
          usd(d.total, 2)
        ])
    )}</div>
    <p class="rule">API-equivalent cost of the local Claude Code transcripts of this repo and its worktrees, at prices from ${esc(usage.pricesDate)}. Nothing is billed on Max; the cost is the weight the allowance follows. Planning is the scheduled planner; implementing is subagents; orchestrating is every other session. Planning runs on <code>origin/main</code>, so its cost is never tied to a ticket.${usage.unpriced.length ? ` Not priced, left out: ${esc(usage.unpriced.join(', '))}.` : ''} Updated ${esc(usage.updated)}.</p>`;
};

const renderTicketCost = (usage: Usage, rows: readonly TicketCost[]): string =>
  `${rows.length ? hbarsHTML(rows, rows.length) : empty('No agent ticket closed in the last ' + SHIP_DAYS + ' days has usage recorded.')}
    <div class="group"><h3>Every ticket with usage</h3>${tableHTML(
      ['Ticket', ...ROLES, 'Total', 'Output', 'Cache read'],
      usage.tickets.map((t) => [
        isTicketId(t.ticket) ? idLink(t.ticket) : txt(t.ticket),
        ...ROLES.map((r) => usd(t[r], 2)),
        usd(t.total, 2),
        mtok(t.output),
        mtok(t.cacheRead)
      ])
    )}</div>
    <p class="rule">Closed agent tickets from the last ${SHIP_DAYS} days, by the API-equivalent cost of sessions on their branch over the last ${usage.windowDays} days. Work before that window isn't counted.</p>`;

/** Cost per closed ticket, then the spend per day and model, from one usage table */
export const renderEffort = (state: DeskState, now: Date): string => {
  const { usage, closed } = state.data;
  if (!usage) return noUsage();
  const { days } = shipped(closed, now);
  const rows = ticketCosts(usage, days);
  return (
    legendHTML() +
    renderTicketCost(usage, rows) +
    renderSpend(usage, days, perTicketAverage(rows))
  );
};

// ---------- All open tickets ----------

export const renderAll = (m: Model, state: DeskState): string => {
  const { filter } = state.ui;
  const queuePos = new Map(m.next.map((x, n) => [x.ticket, n + 1]));
  const shown = m.all.filter((i) =>
    filter === 'all'
      ? true
      : filter === 'agent'
        ? agentState(i) !== null
        : ['unstarted', 'started'].includes(i.statusType) &&
          i.status !== 'Triage'
  );
  const rows = shown
    .map((i) => {
      const s = agentState(i);
      const pos = queuePos.get(i.id);
      const chip = s
        ? `<span class="chip ${s}">${pos !== undefined ? 'agent #' + pos : s}</span>`
        : '';
      return itemHTML(state.details, i, {
        state: s ?? 'plain',
        rank: m.all.indexOf(i) + 1,
        side: chip
      });
    })
    .join('');
  return `<div class="filters" role="group" aria-label="Filter">
      <button type="button" data-f="all" aria-pressed="${filter === 'all'}">All open</button>
      <button type="button" data-f="todo" aria-pressed="${filter === 'todo'}">Todo + In Progress</button>
      <button type="button" data-f="agent" aria-pressed="${filter === 'agent'}">Agent only</button>
    </div>
    ${shown.length ? `<ol>${rows}</ol>` : empty('No tickets match this filter.')}
    <p class="rule">Manual drag order in a Linear view isn't exposed through the connector.</p>`;
};

// ---------- Suggestions ----------

/** An idea with its evidence; the Waiting sheet's React twin is `IdeaCard` in components/before.tsx */
const ideaCard = (state: DeskState, i: Issue): string => {
  const d = state.details.get(i.id)?.idea;
  const when = new Date(i.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
  const part = (h: string, html: string): string =>
    html ? `<div><h4>${h}</h4>${html}</div>` : '';
  const body = state.details.has(i.id)
    ? d
      ? part(
          'Evidence',
          d.evidence.length
            ? `<ul>${d.evidence.map((e) => `<li>${linkIds(inline(e))}</li>`).join('')}</ul>`
            : ''
        ) +
        part(
          'What changes',
          d.change ? `<p>${linkIds(inline(d.change))}</p>` : ''
        ) +
        part('Cost', d.cost ? `<p>${linkIds(inline(d.cost))}</p>` : '') +
        part('Why now', d.why ? `<p>${linkIds(inline(d.why))}</p>` : '')
      : `<p class="rule">The ticket doesn't follow the suggestion shape; read it in Linear.</p>`
    : `<p class="rule">Loading the ticket…</p>`;
  return `<article class="idea">
    <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
    <div class="meta"><span>suggested ${esc(when)}</span>${d?.focus ? `<span>· ${esc(d.focus)}</span>` : ''}</div>
    ${body}
    <p class="rule">Accept: set <code>agent:ready</code> on the ticket. Discard: cancel it with one word in a comment, such as <i>already decided</i>, <i>not worth it</i>, <i>wrong direction</i> or <i>later</i>. The agent reads the word before its next idea.</p>
  </article>`;
};

export const renderIdeas = (m: Model, state: DeskState, now: Date): string => {
  const { ideas } = state.data;
  if (!ideas)
    return empty(
      state.errors.has('ideas')
        ? "The suggestions couldn't load from Linear."
        : 'Loading the suggestions…'
    );
  const { details, ideaReasons } = state;
  const s = m.suggested;
  const lastText = !s
    ? 'No <code>Suggested:</code> value in <code>queue_state</code> yet. The first idle run after 06:00 writes it, once <code>cdwr agent install</code> has run with COD-579.'
    : s.kind === 'suggested'
      ? `${esc(s.date)} · suggested ${idLink(s.ticket)} ${esc(s.title)}`
      : s.kind === 'open'
        ? `${esc(s.date)} · ${idLink(s.ticket)} still waits on your verdict, so no new idea`
        : `${esc(s.date)} · ${esc(s.text)}`;
  const last = `<div class="group"><h3>Last suggest run</h3><div class="${s && ['cap', 'failed', 'other'].includes(s.kind) ? 'empty' : 'rule'}">${lastText}</div></div>`;
  const pending = m.ideasPending.length
    ? `<div class="group"><h3>To decide · ${m.ideasPending.length}</h3>${m.ideasPending.map((i) => ideaCard(state, i)).join('')}</div>`
    : `<div class="group"><h3>To decide</h3>${empty('Nothing to decide. The next idea comes in the first idle run after 06:00, and only when the agent found evidence for one.')}</div>`;
  const stateChip = (i: Issue): string => {
    const a = agentState(i);
    return a
      ? `<span class="chip ${a}">${a}</span>`
      : '<span class="chip ready">done</span>';
  };
  const accepted = m.ideasAccepted.length
    ? `<div class="group"><h3>Accepted · ${m.ideasAccepted.length}</h3><ul>${m.ideasAccepted
        .map((i) =>
          itemHTML(details, i, {
            state: agentState(i) || 'ready',
            side: stateChip(i)
          })
        )
        .join('')}</ul></div>`
    : '';
  const reasonNote = (id: string): string => {
    const reason = ideaReasons.get(id);
    return reason === undefined
      ? ''
      : reason
        ? `<span class="reason">“${esc(reason)}”</span>`
        : `<span class="reason">no reason given</span>`;
  };
  const discarded = m.ideasDiscarded.length
    ? `<div class="group"><h3>Discarded · ${m.ideasDiscarded.length}</h3><ul>${m.ideasDiscarded
        .map((i) =>
          itemHTML(details, i, {
            state: 'plain',
            side: i.canceledAt ? esc(dayLabel(i.canceledAt.slice(0, 10))) : '',
            note: reasonNote(i.id)
          })
        )
        .join('')}</ul></div>`
    : '';
  const month = now.getTime() - 30 * 864e5;
  const recent = <T extends { createdAt: string }>(
    xs: readonly T[],
    at: (i: T) => string | null
  ): number =>
    xs.filter((i) => Date.parse(at(i) || i.createdAt) >= month).length;
  const notWorth = m.ideasDiscarded.filter(
    (i) =>
      Date.parse(i.canceledAt || i.createdAt) >= month &&
      /not worth/i.test(ideaReasons.get(i.id) || '')
  ).length;
  const stats = `<div class="pv-stats"><div><b>${recent(m.ideasAccepted, (i) => i.completedAt)}</b><span>accepted, 30 days</span></div><div><b>${recent(m.ideasDiscarded, (i) => i.canceledAt)}</b><span>discarded, 30 days</span></div><div><b>${notWorth}</b><span>of them "not worth it"</span></div></div>`;
  return (
    last +
    pending +
    stats +
    accepted +
    discarded +
    `<p class="rule">Tickets with the <code>Source: agent-idea</code> label from the last 60 days. The scheduler proposes nothing while one waits on your verdict. From 2026-11-16 the skill reviews the month: more than half discarded as "not worth it" and its one idea of the day is to go weekly.</p>`
  );
};
