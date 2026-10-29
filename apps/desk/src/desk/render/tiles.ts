import { dayKey, dayLabel, esc, hhmm, plural, usd } from '../format';
import { type Model, activityMissing, ideaVerdict, shipped } from '../model';
import { perTicketAverage, spendStats, ticketCosts } from '../spend';
import { type DeskState, type SheetId, bucketsLoaded } from '../state';

import { type IconName, icon } from './html';

// The tiles under the columns, each opening a sheet

type Tile = {
  sheet: SheetId;
  icon: IconName;
  label: string;
  value: string;
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

export const renderTiles = (m: Model, state: DeskState, now: Date): string => {
  const { activity, closed, usage } = state.data;
  const loaded = bucketsLoaded(state.data);
  const { days, total } = shipped(closed, now);
  const avg = perTicketAverage(ticketCosts(usage, days));
  const tiles: Tile[] = [
    {
      sheet: 'activity',
      icon: 'activity',
      label: 'Activity, 24 h',
      value:
        activity && !activityMissing(activity)
          ? plural(m.activityDay, 'event', 'events')
          : '–'
    },
    {
      sheet: 'shipped',
      icon: 'bars',
      label: 'Closed, 30 days',
      value: loaded || closed ? String(total) : '–'
    },
    {
      sheet: 'spend',
      icon: 'coin',
      label: 'Spend, 30 days',
      value: usage ? usd(spendStats(usage, days).total) : '–'
    },
    {
      sheet: 'ticketcost',
      icon: 'ticket',
      label: 'Per closed ticket',
      value: avg === null ? '–' : usd(avg)
    },
    {
      sheet: 'ideas',
      icon: 'bulb',
      label: 'Suggestion, daily',
      ...ideaTile(m, state, now)
    },
    {
      sheet: 'all',
      icon: 'all',
      label: 'Open tickets',
      value: loaded ? String(m.all.length) : '–'
    },
    {
      sheet: 'nuc',
      icon: 'chip',
      label: 'NUC',
      ...nucTile(m)
    },
    {
      sheet: 'timers',
      icon: 'timer',
      label: 'Next scheduler run',
      value: m.live ? 'on events' : m.nextRun ? '~' + hhmm(m.nextRun) : '–'
    }
  ];
  return tiles
    .map(
      (t) =>
        `<button type="button" class="mini${t.bad ? ' bad' : ''}" data-w="${t.sheet}" aria-haspopup="dialog"><span class="ico">${icon(t.icon)}</span><span>${esc(t.label)}</span><b>${esc(t.value)}</b></button>`
    )
    .join('');
};
