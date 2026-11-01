import { SHIP_DAYS } from '../constants';
import {
  ageText,
  dayKey,
  dayLabel,
  esc,
  hhmm,
  plural,
  shortAge,
  usd
} from '../format';
import {
  type Model,
  activityMissing,
  ideaVerdict,
  prOf,
  shipped
} from '../model';
import { perTicketAverage, spendStats, ticketCosts } from '../spend';
import { type DeskState, type SheetId, bucketsLoaded } from '../state';

import { type IconName, icon, prTone } from './html';

// The tiles under the cards, each opening a sheet

type Tile = {
  sheet: SheetId;
  icon: IconName;
  label: string;
  value: string;
  /** The line under the label */
  sub?: string;
  /** The value is a problem */
  bad?: boolean;
};

type TileValue = { value: string; bad?: boolean };

/** The tile's value and whether it's a problem: an idea to decide first, else what the last suggest run did */
const ideaTile = (m: Model, state: DeskState, now: Date): TileValue => {
  const { ideas } = state.data;
  if (m.ideasPending.length)
    return { value: plural(m.ideasPending.length, 'to decide', 'to decide') };
  const s = m.suggested;
  if (!s) return { value: ideas ? 'none yet' : '–' };
  const day = s.date === dayKey(now) ? 'today' : dayLabel(s.date);
  if (s.kind === 'suggested') {
    const i = (ideas || []).find((x) => x.id === s.ticket);
    return { value: i ? `${s.ticket} ${ideaVerdict(i)}` : s.ticket };
  }
  if (s.kind === 'nothing') return { value: `nothing ${day}` };
  if (s.kind === 'open') return { value: `${s.ticket} to decide` };
  return { value: `${s.text}, ${day}`, bad: true };
};

const share = (n: number): string => `${Math.round(n * 100)}%`;

/** The first problem when bad, else the worse of load per core and memory used, with the verdict; stale and missing samples say so */
const nucTile = ({ host }: Model): TileValue => {
  if (!host) return { value: '–' };
  if (host.verdict === 'stale') return { value: 'stale', bad: true };
  const problem = host.problems[0];
  const figure =
    problem === 'load'
      ? `load ${share(host.average.load)}`
      : problem === 'memory'
        ? `memory ${share(host.figures.mem)}`
        : problem === 'disk'
          ? `disk ${share(host.figures.disk)}`
          : problem === 'swap'
            ? 'swap growing'
            : share(Math.max(host.average.load, host.figures.mem));
  return { value: `${figure} · ${host.verdict}`, bad: host.verdict === 'bad' };
};

/** Both windows' used share, `–` for a reset or missing one; the age of the older sample when stale, bad when a window is on course to run out */
const planTile = ({ plan }: Model): TileValue => {
  const windows = [plan.five_hour, plan.seven_day].map((w) =>
    w && !w.reset ? w : null
  );
  const part = (label: string, w: (typeof windows)[number]): string =>
    `${label} ${w ? Math.round(w.used) + '%' : '–'}`;
  const stale = windows.filter((w) => w?.stale);
  const age = Math.max(0, ...stale.map((w) => w?.ageMin ?? 0));
  return {
    value:
      `${part('5h', windows[0])} · ${part('7d', windows[1])}` +
      (stale.length ? ` · ${ageText(age)}` : ''),
    bad: windows.some((w) => w && w.verdict !== 'ok')
  };
};

/** The PRs that wait on you or have failed checks, by what github_events last said */
const prCounts = (
  m: Model,
  state: DeskState
): { waiting: number; failed: number } => {
  let waiting = 0,
    failed = 0;
  for (const x of m.prs) {
    const n = prOf(state.details, x.ticket, x.pr);
    const s =
      n === null
        ? null
        : (m.agentPrs.find((p) => p.pr === Number(n))?.state ?? null);
    const tone = prTone(s);
    if (tone === 'wait') waiting++;
    if (s === 'checks failed') failed++;
  }
  return { waiting, failed };
};

const sessionSub = (m: Model): string =>
  m.hostSessions
    .map(
      (h) =>
        `${h.host} ${[...new Set(h.sessions.map((s) => s.kind))].join('/')}`
    )
    .join(' · ');

export const renderTiles = (m: Model, state: DeskState, now: Date): string => {
  const { activity, closed, usage } = state.data;
  const loaded = bucketsLoaded(state.data);
  const { days, total } = shipped(closed, now);
  const avg = perTicketAverage(ticketCosts(usage, days));
  const runsIn = m.runs !== null;
  const first = m.next[0];
  const prs = prCounts(m, state);
  const idea = ideaTile(m, state, now);
  const today = m.runsToday;
  const sessions = m.hostSessions.reduce((n, h) => n + h.sessions.length, 0);
  const tiles: Tile[] = [
    {
      sheet: 'next',
      icon: 'next',
      label: 'up next',
      value: runsIn ? String(m.next.length) : '–',
      sub: first ? [first.ticket, first.reason].filter(Boolean).join(' · ') : ''
    },
    {
      sheet: 'review',
      icon: 'review',
      label: 'review & check',
      value: runsIn ? String(m.prs.length) : '–',
      sub: runsIn ? `${prs.waiting} await you · live` : '',
      bad: prs.failed > 0
    },
    {
      sheet: 'handoffs',
      icon: 'handoff',
      label: 'hand-offs left',
      value: runsIn ? String(m.handoffItems) : '–',
      sub: runsIn ? (m.handoffItems ? 'merged, steps remain' : 'none') : ''
    },
    {
      sheet: 'session',
      icon: 'terminal',
      label: 'live sessions',
      value: String(sessions),
      sub: sessionSub(m)
    },
    {
      sheet: 'runs',
      icon: 'timer',
      label: 'runs today',
      value: runsIn ? String(today.count) : '–',
      sub: runsIn
        ? `median ${today.medianMs === null ? '–' : shortAge(today.medianMs / 6e4)} · ${today.failed} failed`
        : '',
      bad: today.failed > 0
    },
    {
      sheet: 'activity',
      icon: 'activity',
      label: 'activity, 24 h',
      value:
        activity && !activityMissing(activity) ? String(m.activityDay) : '–',
      sub: `agent ${m.activityBy.agent} · you ${m.activityBy.human}`
    },
    {
      sheet: 'shipped',
      icon: 'box',
      label: 'shipped, 30 days',
      value: loaded || closed ? String(total) : '–',
      sub: `≈ ${(total / SHIP_DAYS).toFixed(1)} per day`
    },
    {
      sheet: 'effort',
      icon: 'coin',
      label: 'effort, 30 days',
      value: usage ? usd(spendStats(usage, days).total) : '–',
      sub: 'simulated' + (avg === null ? '' : ` · ${usd(avg)} per ticket`)
    },
    {
      sheet: 'all',
      icon: 'all',
      label: 'open tickets',
      value: loaded ? String(m.all.length) : '–',
      sub: 'via Linear poll, 5 min'
    },
    {
      sheet: 'ideas',
      icon: 'bulb',
      label: 'suggested today',
      value: state.data.ideas ? String(m.ideasPending.length) : '–',
      sub: m.ideasPending.length
        ? `${m.ideasPending[0].id} · accept?`
        : idea.value,
      bad: idea.bad
    }
  ];
  const interim: Tile[] = [
    {
      sheet: 'limit',
      icon: 'load',
      label: 'limit, PRs in flight',
      value: runsIn ? `${m.limit.used} of ${m.limit.max}` : '–',
      bad: runsIn && m.limit.used >= m.limit.max
    },
    { sheet: 'nuc', icon: 'chip', label: 'NUC', ...nucTile(m) },
    { sheet: 'plan', icon: 'load', label: 'plan usage', ...planTile(m) },
    {
      sheet: 'timers',
      icon: 'timer',
      label: 'next scheduler run',
      value: m.live ? 'on events' : m.nextRun ? '~' + hhmm(m.nextRun) : '–'
    }
  ];
  const html = (ts: Tile[]): string =>
    ts
      .map(
        (t) =>
          `<button type="button" class="tile${t.bad ? ' bad' : ''}" data-w="${t.sheet}" aria-haspopup="dialog"><span class="ico">${icon(t.icon)}</span><b class="v">${esc(t.value)}</b><span class="l">${esc(t.label)}</span>${t.sub ? `<span class="s">${esc(t.sub)}</span>` : ''}</button>`
      )
      .join('');
  return `<div class="grid-head"><h2>Everything else</h2><span>each widget opens a sheet</span></div><div class="tiles">${html(tiles)}</div>
    <div class="grid-head interim"><h2>Until the Platform view</h2></div><div class="tiles small">${html(interim)}</div>`;
};
