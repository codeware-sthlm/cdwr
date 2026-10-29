import { REFRESH_MS } from '../../data';
import { CLOSED_WINDOW_DAYS, IDEA_WINDOW_DAYS, type Issue } from '../../linear';
import type { HostMetricRow } from '../../supabase';
import {
  AGENT_AVATAR,
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  HOST_STALE_MIN,
  HOST_WINDOW_MIN,
  LIMIT,
  LINEAR_ISSUE,
  ROLES,
  SHIP_DAYS,
  STUCK_MIN,
  waitName
} from '../constants';
import {
  DAY_MS,
  ageText,
  bytes,
  dayLabel,
  esc,
  hhmm,
  inline,
  mtok,
  plural,
  seenAgo,
  span,
  txt,
  usd
} from '../format';
import { DETAIL_STALE_MS, HANDOFF_STALE_MS, REASON_STALE_MS } from '../load';
import {
  type HostFigures,
  type HostProblem,
  type Model,
  type TicketRef,
  activityMissing,
  agentState,
  hostFigures,
  isProblem,
  prOf,
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
import type { DeskState, Detail, SheetId } from '../state';
import type { Job, QueueNext } from '../types';

import { headline } from './band';
import { chartSlot, gauge, sparkline } from './charts';
import { blockedText, prWaitText, whyLine } from './columns';
import {
  empty,
  hostName,
  idLink,
  loadMeter,
  parkedText,
  prn,
  pvMore,
  reasonChip,
  sessionLabel
} from './html';

// The sheets: one per column, gauge and tile. A sheet body is a pure function of the model and the state.

const MINUTE_MS = 60 * 1000;
const ACTIVITY_STALE_MIN = 30; // the activity table's last update older than this shows in the warning colour
const GH_COMMIT = 'https://github.com/codeware-sthlm/cdwr/commit/';

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

const TICKET_ID = /^[A-Z]+-\d+$/;

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
      ? `<div class="next">${txt(d.next)}</div>`
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

// ---------- Waiting on you, next, after ----------

const renderBefore = (m: Model, state: DeskState): string => {
  if (!m.v) return empty('No queue view yet.');
  const group = <X extends { ticket: string }>(
    h: string,
    xs: readonly X[],
    rowState: string,
    extra: (x: X) => ItemOpts = () => ({ showNext: true })
  ): string =>
    xs.length
      ? `<div class="group"><h3>${h} · ${xs.length}</h3><ul>${xs.map((x) => itemHTML(state.details, m.get(x.ticket), { state: rowState, ...extra(x) })).join('')}</ul></div>`
      : '';
  const ideasHTML = m.ideasPending.length
    ? `<div class="group"><h3>Ideas to decide · ${m.ideasPending.length}</h3>${m.ideasPending.map((i) => ideaCard(state, i)).join('')}</div>`
    : '';
  return (
    group('Plans to approve', m.plans, 'needs-input') +
      group('Questions', m.questions, 'needs-input') +
      group('Ready to label', m.toLabel, 'ready', (x) => ({
        side: '<span class="chip label">ready to label</span>',
        note: x.parent ? `Next part of ${esc(x.parent)}` : undefined
      })) +
      ideasHTML || empty('No plan, question, label or idea waits for you.')
  );
};

/** The row class for why a ticket is queued */
const reasonState = (x: QueueNext): string =>
  x.reason === 'ready'
    ? 'ready'
    : x.reason === 'answered'
      ? 'answered'
      : x.reason === 'review feedback'
        ? 'review'
        : 'working';

const freeHTML = (m: Model): string => {
  if (!m.held.free.length) return '';
  return `<ul class="knobs">${m.held.free
    .map((f) =>
      f.action === 'review'
        ? `<li><b>Review ${f.pr ? '#' + esc(f.pr) : esc(f.ticket)}</b><span>Merging or closing ${esc(f.ticket)} frees a slot</span></li>`
        : f.action === 'wait'
          ? `<li><b>${esc(f.ticket)} waits on ${f.pr ? '#' + esc(f.pr) : 'its PR'}</b><span>Its slot frees when that PR merges or closes</span></li>`
          : `<li><b>Run with <code>limit=${esc(f.value)}</code></b><span>Raises the limit for that session only</span></li>`
    )
    .join('')}</ul>`;
};

const renderNext = (m: Model, state: DeskState): string => {
  if (!m.v) return empty('No queue view yet.');
  const { details } = state;
  const next = m.next.length
    ? `<ol>${m.next.map((x, n) => itemHTML(details, m.get(x.ticket), { state: reasonState(x), rank: n + 1, side: `${prn(prOf(details, x.ticket))} ${reasonChip(x.reason)}`, note: whyLine(m, x) })).join('')}</ol>`
    : empty(
        'Nothing to take. In Linear, add <code>agent:ready</code> to a ticket as the last step of refining it.'
      );
  const parked = m.parked.length
    ? `<div class="group"><h3>Parked on a wait · ${m.parked.length}</h3><ul>${m.parked.map((p) => itemHTML(details, m.get(p.ticket), { state: 'working', side: `${prn(prOf(details, p.ticket, p.pr))} <span class="chip parked">${esc(waitName(p.wait) || p.wait)}</span>`, note: `${parkedText(p)}${p.pr ? ' for #' + esc(p.pr) : ''}, since ${p.since ? hhmm(Date.parse(p.since)) : '?'}. It resumes when that finishes.` })).join('')}</ul></div>`
    : '';
  const held = m.held.tickets.length
    ? `<div class="group"><h3>Held by the limit · ${m.held.tickets.length}</h3><ul>${m.held.tickets.map((id) => itemHTML(details, m.get(id), { state: 'plain', side: '<span class="chip held">held</span>' })).join('')}</ul>${freeHTML(m)}</div>`
    : '';
  return `<div class="group"><h3>Next · ${m.next.length}</h3>${next}</div>${parked}${held}
    <p class="rule">A session resumes its own work first, then takes over stale claims, answered tickets and review feedback, then new <code>agent:ready</code> tickets while the limit has room. A ticket parked on CI or a Copilot review resumes when the wait resolves. With no session alive, the scheduler starts one for anything but a new ready ticket, which it plans itself.</p>`;
};

const handoffCard = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  x: { ticket: string; items?: string[] }
): string => {
  const i = m.get(x.ticket);
  const when = i.completedAt
    ? 'closed ' +
      new Date(i.completedAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      })
    : esc(i.status);
  return `<article class="ho">
    <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
    <div class="meta">${when}${prOf(details, x.ticket) ? ' · ' + prn(prOf(details, x.ticket)) : ''}</div>
    <ul class="checks">${(x.items || []).map((t) => `<li><span>${inline(t)}</span></li>`).join('')}</ul>
  </article>`;
};

const renderHandoffs = (m: Model, state: DeskState): string => {
  if (!m.v) return empty('No queue view yet.');
  const { details } = state;
  const prs = m.prs.length
    ? `<div class="group"><h3>Open PRs · ${m.prs.length}</h3><ul>${m.prs
        .map((x, n) => {
          const held = blockedText(m, x.ticket);
          const note = [
            held ? 'Merge order: ' + held : '',
            prWaitText(m, x.ticket)
          ]
            .filter(Boolean)
            .join('. ');
          return itemHTML(details, m.get(x.ticket), {
            state: held ? 'blocked' : 'review',
            rank: m.prs.length > 1 ? n + 1 : '',
            showNext: true,
            note: note || undefined,
            side: `${prn(prOf(details, x.ticket, x.pr))}${held ? ' <span class="chip blocked">merge later</span>' : ''}`
          });
        })
        .join('')}</ul></div>`
    : '';
  const ho = m.handoffs.length
    ? `<div class="group"><h3>Merged, hand-offs left · ${m.handoffItems}</h3>${m.handoffs.map((x) => handoffCard(m, details, x)).join('')}</div>`
    : '';
  return (
    (prs + ho || empty('No PR to review and no hand-off left.')) +
    `<p class="rule">Open PRs are numbered in merge order: a PR whose ticket is blocked by another open ticket in Linear comes after that ticket's PR, and is marked <i>merge later</i> until the blocker closes. Hand-offs come from agent tickets merged in the last 14 days. They don't count toward the limit. The heading must read exactly <code>Hand-off checklist:</code>.</p>`
  );
};

// ---------- Session, limit, scheduler, timers ----------

const renderAttended = (m: Model, now: Date): string => {
  const s = m.session;
  const h = headline(m, now);
  const head = `<div class="group"><h3>Now</h3><div class="verdict">${h.text}</div>${h.note ? `<p class="rule">${h.note}</p>` : ''}</div>`;
  const facts = s
    ? `<div class="group"><h3>Heartbeat</h3><dl class="kv">
      <dt>State</dt><dd>${esc(sessionLabel(s.state))}${s.detail ? ' · ' + esc(s.detail) : ''}</dd>
      <dt>Ticket</dt><dd>${s.ticket ? idLink(s.ticket) : 'none claimed'}</dd>
      <dt>Last seen</dt><dd>${s.lastSeen ? esc(new Date(s.lastSeen).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' · ' + esc(seenAgo(s.lastSeen, now)) : '–'}</dd>
      ${s.id ? `<dt>Session</dt><dd><code>${esc(s.id.slice(0, 8))}</code></dd>` : ''}
    </dl></div>`
    : '';
  return (
    head +
    facts +
    `<div class="group"><h3>What the states mean</h3><ul class="knobs">
      <li><b>Live</b><span>Hooks stamped the session recently. <i>working</i> runs tools, <i>polling</i> waits in <code>wait.sh</code> for the queue to change, which costs no turns.</span></li>
      <li><b>Stuck</b><span>Polling for ${STUCK_MIN} min or more while the queue has work for it: its wait missed the change. Type anything in its terminal.</span></li>
      <li><b>Waits on you</b><span>A permission prompt or an idle prompt in the terminal. Nothing moves until you answer it.</span></li>
      <li><b>Stopped</b><span>The session ended its turn or exited. With work waiting, the scheduler starts an implementing session on its next run.</span></li>
      <li><b>No session</b><span>No work-queue session registered on this Mac.</span></li>
    </ul></div>
    <p class="rule">From the queue view the scheduler publishes on every run that changes it, so it is as fresh as the last run and stops while the Mac sleeps. <code>cdwr agent status</code> shows the same.</p>`
  );
};

const renderLoad = (m: Model, state: DeskState): string => {
  const { details } = state;
  const max = m.limit.max || LIMIT;
  return `<div class="pv-stats"><div><b>${m.limit.used} of ${max}</b><span>agent PRs in flight</span></div><div><b>${m.held.tickets.length}</b><span>ready tickets held</span></div></div>${loadMeter(m)}
    <div class="group"><h3>Holding a slot · ${m.slots.length}</h3>${m.slots.length ? `<ul>${m.slots.map((x) => itemHTML(details, m.get(x.ticket), { state: 'review', side: prn(prOf(details, x.ticket, x.pr)), note: esc(x.why) })).join('')}</ul>` : empty('None.')}</div>
    ${m.held.tickets.length ? `<div class="group"><h3>Held · ${m.held.tickets.length}</h3><ul>${m.held.tickets.map((id) => itemHTML(details, m.get(id), { state: 'plain' })).join('')}</ul>${freeHTML(m)}</div>` : ''}
    <p class="rule">Each open <code>agent:review</code> PR counts one, and so does a ticket parked on its PR's CI or Copilot review, since its PR is already open. Hand-offs don't count. At ${max}, <code>/work-queue</code> stops starting new tickets but still resumes your answers, reviews and parked work. A session's <code>limit=N</code> isn't visible here, so the queue view's limit applies.</p>`;
};

/** "Container · sha-9c7a20d" (the commit links to GitHub), "Mac · launchd", or nothing before the line says */
const hostHTML = (job: Job): string => {
  if (!job.host) return '';
  const rev = job.rev
    ? ` · <a class="prn" href="${GH_COMMIT + esc(job.rev.slice(4))}" target="_blank" rel="noopener">${esc(job.rev)}</a>`
    : '';
  return esc(hostName(job.host)) + rev;
};

/** What to do about scripts that differ from main: pull a newer image, or reinstall on the Mac */
const updateHint = (job: Job): string =>
  job.host === 'container'
    ? 'pull the new image: <code>docker compose pull && docker compose up -d</code> in <code>apps/agent-host</code>'
    : 'run <code>cdwr agent install</code>';

const renderScheduler = (m: Model): string => {
  if (!m.runs)
    return empty(
      "The runs haven't loaded yet. The scheduled planner records them in Supabase after every run."
    );
  const last = m.runs.last;
  const head = last
    ? `<div class="group"><h3>Last run</h3><div class="${m.schedulerStale ? 'empty' : 'rule'}">${esc(last.when)} · ${esc(last.outcome)}${m.schedulerStale ? `. Nothing for ${Math.floor(m.lastRunAge ?? 0)} hours: check that the Mac is awake, and <code>cdwr agent status</code> for a paused or unloaded job.` : ''}</div></div>`
    : '';
  const job = m.runs.job;
  const jobText = !job
    ? 'Not reported yet. The installed run.sh predates the Job line: run <code>cdwr agent install</code>.'
    : job.install === 'stale'
      ? `${esc(job.line)}. The ${job.host === 'container' ? "image's" : 'installed'} copy differs from main${job.items ? ` (${esc(job.items)})` : ''}: ${updateHint(job)}.`
      : job.install === 'unknown'
        ? `${esc(job.line)}. The scheduler couldn't read origin/main to compare.`
        : esc(job.line);
  const hostRow = job?.host
    ? `<dl class="kv"><dt>Runs on</dt><dd>${hostHTML(job)}</dd>${job.host === 'container' && !job.rev ? `<dt>Image</dt><dd>No commit on the Job line yet. The image learns its own commit with the ticket that bakes it in; until then <code>docker inspect cdwr-agent</code> shows it.</dd>` : ''}</dl>`
    : '';
  const jobHTML = `<div class="group"><h3>Job</h3>${hostRow}<div class="${!job || job.install === 'stale' ? 'empty' : 'rule'}">${jobText}</div></div>`;
  const rows = m.runs.rows
    .map(
      (r) => `<li class="item ${isProblem(r.outcome) ? 'blocked' : 'ready'}">
      <span class="rank"></span>
      <div class="main"><div><b>${esc(r.outcome)}</b>${r.ticket ? ` <span class="id">${txt(r.ticket)}</span>` : ''}</div>
      <div class="meta">${inline(r.detail)}</div></div>
      <span class="side">${esc(r.when)}</span></li>`
    )
    .join('');
  return (
    head +
    jobHTML +
    `<div class="group"><h3>Recent runs that did something</h3>${rows ? `<ul>${rows}</ul>` : empty('None yet.')}</div>
    <p class="rule">Idle runs update the last-run and job lines at most once an hour. The scheduler plans new tickets itself. For answers, reviews and parked work it starts an implementing session when none is alive (<code>launched</code>, then <code>implemented</code>, <code>cap</code> or <code>failed</code>). A problem is any outcome other than planned, idle, suggested or nothing, for example a failed run or one that planned nothing. It turns the tile red until a later run goes well. Full logs: <code>cdwr agent logs</code>.</p>`
  );
};

type TimerRow = readonly [what: string, value: string, source: string];

// Kept by hand in step with run.sh, the work-queue skill and agent.logic.ts; only the interval is read live
const timerGroups = (m: Model): [string, TimerRow[]][] => {
  const min = m.runs?.job?.minutes;
  const assumed = min ? '' : ' (assumed: no Job line yet)';
  return [
    [
      'Scheduler (launchd, run.sh)',
      [
        [
          'Scheduled run',
          m.live
            ? `on events, fallback every ${m.runMinutes} min`
            : `every ${m.runMinutes} min`,
          `launchd StartInterval, from RUN_INTERVAL_SECONDS in agent.logic.ts (600 s). The live value comes from the Job line${assumed}`
        ],
        [
          'First run after install',
          'one interval later',
          'RunAtLoad is off; cdwr agent run starts one now'
        ],
        [
          'Next run',
          m.live
            ? `on events, fallback about ${m.nextRun ? hhmm(m.nextRun) : '?'}`
            : m.nextRun
              ? 'about ' + hhmm(m.nextRun)
              : 'unknown',
          'last run plus whole intervals; sleep shifts it'
        ],
        [
          'Runs table',
          'every run',
          'run.sh record_run, one row per run; a warn is a row of its own; the desk hides idle runs'
        ],
        [
          'Runs table history',
          '30 days, at most 500 runs',
          'the desk reads that window'
        ],
        [
          'Usage table',
          'at most once an hour',
          "run.sh record_usage runs `cdwr agent usage-record` from the planner's checkout"
        ],
        [
          'Activity table',
          'every run',
          "run.sh record_activity: 7 days, newest 200 events, from Linear's issue history via `cdwr agent activity`"
        ],
        [
          'Queue view',
          'every run',
          'run.sh, watch.jq `queue_view`; a change is written to queue_state at once'
        ],
        [
          'Daily suggestion',
          'first idle run after 06:00',
          'run.sh suggest_gate; AGENT_QUEUE_SUGGEST_DAYS between runs (0 switches it off), its own budget; an idea still waiting on you blocks the next'
        ],
        [
          'Implementing session',
          '$15 per run, $40 per day',
          'implement.sh `AGENT_QUEUE_IMPLEMENT_BUDGET_USD`, run.sh `AGENT_QUEUE_IMPLEMENT_CAP_USD`; two launches that change nothing stop it for that ticket'
        ],
        ['Linear API call', '20 s timeout', 'run.sh curl -m 20'],
        [
          'Offline check',
          '5 s, before any Linear call',
          'lib.sh `offline`: no network (a dark wake from sleep) skips the run without a record'
        ],
        [
          'Lock called stale',
          'after 10 min',
          'STALE_LOCK_MS in agent.logic.ts, read by cdwr agent status'
        ]
      ]
    ],
    [
      'PR watch (every run)',
      [
        [
          'agent:review tickets watched',
          'open, or closed ≤ 14 days',
          'run.sh WATCHED query'
        ]
      ]
    ],
    [
      'Attended /work-queue (skill)',
      [
        [
          'Session heartbeat',
          'every tool call',
          'hooks stamp the session file; Stop and SessionEnd mark it stopped'
        ],
        [
          'Claim take-over',
          'after 2 h',
          'only for a session that left no heartbeat'
        ],
        [
          'Copilot and CI waits',
          'parked, polled every 60 s',
          'wait.sh wakes the session when the wait resolves'
        ],
        [
          'Limit',
          'open agent PRs, default ' + LIMIT,
          'hand-offs no longer count; they show for 14 days after merge'
        ]
      ]
    ],
    [
      'This page',
      [
        [
          'Linear refresh',
          `every ${REFRESH_MS / MINUTE_MS} min`,
          'ticket lists, the runs, usage and activity tables; Refresh forces it'
        ],
        [
          'Activity called stale',
          `after ${ACTIVITY_STALE_MIN} min`,
          'its Updated line turns the warning colour'
        ],
        [
          'Ticket details',
          `cached ${DETAIL_STALE_MS / 1000} s`,
          'plan progress and Next lines in the sheets'
        ],
        [
          'Suggestions',
          `every ${REFRESH_MS / MINUTE_MS} min`,
          `agent-idea tickets of the last ${IDEA_WINDOW_DAYS} days; the discard word of a cancelled one is its last comment, cached ${REASON_STALE_MS / MINUTE_MS} min`
        ],
        [
          'Hand-off ticks',
          `with each refresh, cached ${HANDOFF_STALE_MS / 1000} s`,
          "read from the ticket's PR ready comment, ahead of the scheduler; a newly merged ticket still waits for its run"
        ],
        [
          'Session stuck',
          `polling ≥ ${STUCK_MIN} min with work queued`,
          "its last heartbeat to the queue view's time; the band turns red"
        ],
        [
          'Scheduler silent',
          `after ${m.staleHours} h`,
          "2 h, or twice the interval plus an hour when that's longer"
        ],
        ['Run problems', 'last 24 h', 'until a later run goes well'],
        [
          'Titles of closed tickets',
          `closed ≤ ${CLOSED_WINDOW_DAYS} days`,
          'CLOSED_WINDOW_DAYS in linear.ts'
        ]
      ]
    ]
  ];
};

const renderTimers = (m: Model): string =>
  timerGroups(m)
    .map(
      ([h, rows]) =>
        `<div class="group"><h3>${esc(h)}</h3><ul>${rows
          .map(
            ([what, value, src]) =>
              `<li class="item plain"><span class="rank"></span><div class="main"><div><b>${esc(what)}</b></div><div class="meta">${inline(src)}</div></div><span class="side">${esc(value)}</span></li>`
          )
          .join('')}</ul></div>`
    )
    .join('');

// ---------- NUC ----------

const PROBLEM_TEXT: Record<HostProblem, string> = {
  load: `average load per core above ${HOST_LOAD_PER_CORE_MAX}`,
  memory: `memory used above ${HOST_MEM_USED_MAX * 100}%`,
  swap: 'swap in use and growing',
  disk: `disk free below ${HOST_DISK_FREE_MIN * 100}%`
};

type Figure = {
  key: keyof HostFigures;
  title: string;
  /** The least the sparkline's top stands for, so a quiet figure stays flat */
  floor: number;
  /** Where the figure turns bad, as the same share the gauge shows; null when it has no limit of its own */
  limit: number | null;
  problem: HostProblem | null;
  detail: (r: HostMetricRow) => string;
};

const FIGURES: readonly Figure[] = [
  {
    key: 'load',
    title: 'Load per core',
    floor: 2,
    limit: HOST_LOAD_PER_CORE_MAX,
    problem: 'load',
    detail: (r) =>
      `${r.load1.toFixed(2)} / ${r.load5.toFixed(2)} / ${r.load15.toFixed(2)} over ${plural(r.cores, 'core', 'cores')}, 1 / 5 / 15 min`
  },
  {
    key: 'mem',
    title: 'Memory used',
    floor: 1,
    limit: HOST_MEM_USED_MAX,
    problem: 'memory',
    detail: (r) =>
      `${bytes(r.mem_total - r.mem_available)} of ${bytes(r.mem_total)}`
  },
  {
    key: 'swap',
    title: 'Swap used',
    floor: 1,
    limit: null,
    problem: 'swap',
    detail: (r) =>
      r.swap_total
        ? `${bytes(r.swap_total - r.swap_free)} of ${bytes(r.swap_total)}`
        : 'no swap'
  },
  {
    key: 'disk',
    title: 'Disk used',
    floor: 1,
    limit: 1 - HOST_DISK_FREE_MIN,
    problem: 'disk',
    detail: (r) =>
      `${bytes(r.disk_total - r.disk_free)} of ${bytes(r.disk_total)}`
  },
  {
    key: 'container',
    title: 'Container memory',
    floor: 1,
    limit: null,
    problem: null,
    detail: (r) =>
      r.cgroup_mem_current !== null && r.cgroup_mem_max !== null
        ? `${bytes(r.cgroup_mem_current)} of its ${bytes(r.cgroup_mem_max)} limit`
        : ''
  }
];

const renderNuc = (m: Model, state: DeskState, now: Date): string => {
  if (!state.data.hostMetrics)
    return empty(
      state.errors.has('hostMetrics')
        ? "The host_metrics table couldn't load from Supabase."
        : 'Loading the host samples…'
    );
  const h = m.host;
  if (!h)
    return empty(
      'No host samples yet. The queue host writes one about every ten minutes, from a Linux machine only.'
    );
  const verdict =
    h.verdict === 'stale'
      ? `No sample for ${span(h.ageMin)}`
      : h.problems.length
        ? h.problems.map((p) => PROBLEM_TEXT[p]).join('; ')
        : 'Within limits';
  const from = now.getTime() - DAY_MS;
  const figures = FIGURES.flatMap((f) => {
    const latest = h.figures[f.key];
    const average = h.average[f.key];
    if (latest === null || average === null) return [];
    const bad =
      h.verdict !== 'stale' &&
      f.problem !== null &&
      h.problems.includes(f.problem);
    const points = h.series.flatMap((r) => {
      const value = hostFigures(r)[f.key];
      return value === null ? [] : [{ at: Date.parse(r.at), value }];
    });
    const max = Math.max(f.floor, ...points.map((p) => p.value));
    return [
      `<div class="fig"><div class="figh"><h3>${f.title}</h3><b class="${bad ? 'bad' : ''}">${pct(latest, 1)}</b><span>${HOST_WINDOW_MIN} min average ${pct(average, 1)}</span></div>
      ${gauge(latest, bad)}
      ${sparkline(points, from, now.getTime(), max, f.limit, `${f.title}, last 24 hours`)}
      <p class="rule">${esc(f.detail(h.latest))}</p></div>`
    ];
  });
  return `<div class="group"><h3>${esc(h.host)}</h3><div class="verdict ${h.verdict === 'ok' ? '' : 'bad'}">${esc(verdict)}</div><p class="rule">Newest sample ${esc(ageText(h.ageMin))}, ${plural(h.series.length, 'sample', 'samples')} in the last 24 hours.</p></div>
    <div class="figs">${figures.join('')}</div>
    <p class="rule">From the <code>host_metrics</code> table, one row about every ten minutes from the queue host. Bad is an average load per core above ${HOST_LOAD_PER_CORE_MAX} over ${HOST_WINDOW_MIN} minutes (the 5-minute load average), memory used above ${HOST_MEM_USED_MAX * 100}% of the total, swap in use and growing over ${HOST_WINDOW_MIN} minutes, or disk free below ${HOST_DISK_FREE_MIN * 100}%. The dashed line marks the limit. A host silent for more than ${HOST_STALE_MIN} minutes shows as stale.</p>`;
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

const ticketHTML = (t: string): string =>
  TICKET_ID.test(t)
    ? `<a class="id" href="${LINEAR_ISSUE + t}" target="_blank" rel="noopener">${esc(t)}</a>`
    : `<span class="id">${esc(t || '—')}</span>`;

const changeHTML = (c: string): string => inline(c.replace(/\*\*/g, ''));

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
        `<tr><td><time>${esc(r.when)}</time></td><td>${ticketHTML(r.ticket)}</td><td>${actorHTML(r.actor)}</td><td>${changeHTML(r.change)}</td></tr>`
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

const renderActivity = (m: Model, state: DeskState): string => {
  const { activity } = state.data;
  if (!activity) return empty("The activity table hasn't loaded yet.");
  if (activityMissing(activity)) return empty(NO_ACTIVITY);
  const tickets = [
    ...new Set(
      activity.rows.map((r) => r.ticket).filter((t) => TICKET_ID.test(t))
    )
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
    <p class="rule">From Linear's issue history of tickets that carried an <code>agent:*</code> label, and the scheduler's own runs. The agent and Håkan write through the same Linear account, so only comments starting <code>**Agent</code> say <b>agent</b>; other changes from that account carry its name. Updated ${activityHead(m, activity.header)}.</p>`;
};

// ---------- Closed, spend, cost per ticket ----------

const renderShipped = (state: DeskState, now: Date): string => {
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

const renderSpend = (state: DeskState, now: Date): string => {
  const { usage, closed } = state.data;
  if (!usage) return noUsage();
  const { days } = shipped(closed, now);
  const s = spendStats(usage, days);
  const tok = tokenTotals(usage.models);
  const unattributed = unattributedTotal(usage);
  const perTicket = perTicketAverage(ticketCosts(usage, days));
  return `<div class="pv-stats">
      <div><b>${usd(s.total)}</b><span>last ${SHIP_DAYS} days</span></div>
      <div><b>${usd(s.week)}</b><span>last 7 days</span></div>
      <div><b>${usd(perTicket)}</b><span>per closed ticket</span></div>
      <div><b>${pct(tok.cacheRead, tok.all)}</b><span>of tokens are cache reads</span></div>
      <div><b>${pct(unattributed, usage.total)}</b><span>unattributed</span></div>
    </div>
    ${legendHTML()}
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

const renderTicketCost = (state: DeskState, now: Date): string => {
  const { usage, closed } = state.data;
  if (!usage) return noUsage();
  const rows = ticketCosts(usage, shipped(closed, now).days);
  return `${legendHTML()}${rows.length ? hbarsHTML(rows, rows.length) : empty('No agent ticket closed in the last ' + SHIP_DAYS + ' days has usage recorded.')}
    <div class="group"><h3>Every ticket with usage</h3>${tableHTML(
      ['Ticket', ...ROLES, 'Total', 'Output', 'Cache read'],
      usage.tickets.map((t) => [
        txt(t.ticket),
        ...ROLES.map((r) => usd(t[r], 2)),
        usd(t.total, 2),
        mtok(t.output),
        mtok(t.cacheRead)
      ])
    )}</div>
    <p class="rule">Closed agent tickets from the last ${SHIP_DAYS} days, by the API-equivalent cost of sessions on their branch over the last ${usage.windowDays} days. Work before that window isn't counted.</p>`;
};

// ---------- All open tickets ----------

const renderAll = (m: Model, state: DeskState): string => {
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
            ? `<ul>${d.evidence.map((e) => `<li>${inline(e)}</li>`).join('')}</ul>`
            : ''
        ) +
        part('What changes', d.change ? `<p>${inline(d.change)}</p>` : '') +
        part('Cost', d.cost ? `<p>${inline(d.cost)}</p>` : '') +
        part('Why now', d.why ? `<p>${inline(d.why)}</p>` : '')
      : `<p class="rule">The ticket doesn't follow the suggestion shape; read it in Linear.</p>`
    : `<p class="rule">Loading the ticket…</p>`;
  return `<article class="idea">
    <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
    <div class="meta"><span>suggested ${esc(when)}</span>${d?.focus ? `<span>· ${esc(d.focus)}</span>` : ''}</div>
    ${body}
    <p class="rule">Accept: set <code>agent:ready</code> on the ticket. Discard: cancel it with one word in a comment, such as <i>already decided</i>, <i>not worth it</i>, <i>wrong direction</i> or <i>later</i>. The agent reads the word before its next idea.</p>
  </article>`;
};

const renderIdeas = (m: Model, state: DeskState, now: Date): string => {
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

// ---------- The registry ----------

export type SheetDef = {
  title: string;
  sub: string;
  body: (m: Model, state: DeskState, now: Date) => string;
};

/** Every sheet by id; a new SheetId fails to compile until it has an entry */
export const SHEETS: Record<SheetId, SheetDef> = {
  before: {
    title: 'Waiting on you before the agent can build',
    sub: "Plans to approve and questions to answer. Reply in the ticket's newest Agent comment.",
    body: renderBefore
  },
  next: {
    title: 'What the agent takes next',
    sub: "In the order a session takes them, from the scheduler's queue view",
    body: renderNext
  },
  after: {
    title: 'Review and check',
    sub: "Open agent PRs, and unticked hand-offs from each ticket's latest Agent: PR ready comment. Tick them in Linear.",
    body: renderHandoffs
  },
  session: {
    title: 'Session',
    sub: "The work-queue session's heartbeat, and how the next step is decided",
    body: (m, _state, now) => renderAttended(m, now)
  },
  limit: {
    title: 'Limit',
    sub: "Agent PRs in flight count: open reviews and tickets parked on their PR's checks. At the limit no new ticket starts; answers, reviews and parked work still resume.",
    body: renderLoad
  },
  scheduler: {
    title: 'Scheduler',
    sub: 'The scheduled runs, from the runs table',
    body: renderScheduler
  },
  timers: {
    title: 'Timers',
    sub: "Every interval, window and timeout the queue runs on, and where it's set",
    body: renderTimers
  },
  nuc: {
    title: 'NUC',
    sub: 'How hard the queue host works: load, memory, swap and disk, with the last 24 hours',
    body: renderNuc
  },
  activity: {
    title: 'Activity',
    sub: "Every status, label, description and comment change on agent tickets, plus the scheduler's runs, newest first",
    body: renderActivity
  },
  shipped: {
    title: 'Closed by the agent',
    sub: `Agent tickets closed per day, last ${SHIP_DAYS} days`,
    body: (_m, state, now) => renderShipped(state, now)
  },
  spend: {
    title: 'Spend per day',
    sub: `API-equivalent spend per day by role, last ${SHIP_DAYS} days, from the usage table`,
    body: (_m, state, now) => renderSpend(state, now)
  },
  ticketcost: {
    title: 'Cost per closed ticket',
    sub: "Agent tickets closed in the last 30 days, by what their branch's sessions cost",
    body: (_m, state, now) => renderTicketCost(state, now)
  },
  all: {
    title: 'All open tickets',
    sub: 'Same order as the agent: status, priority, then age',
    body: renderAll
  },
  ideas: {
    title: 'Agent suggestions',
    sub: 'One evidence-led idea a day, from the first idle run after 06:00. Accept it with agent:ready; discard it by cancelling with one word in a comment.',
    body: renderIdeas
  }
};
