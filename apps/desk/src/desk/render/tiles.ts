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
      sheet: 'timers',
      icon: 'timer',
      label: 'Next scheduler run',
      value: m.nextRun ? '~' + hhmm(m.nextRun) : '–'
    }
  ];
  return tiles
    .map(
      (t) =>
        `<button type="button" class="mini${t.bad ? ' bad' : ''}" data-w="${t.sheet}" aria-haspopup="dialog"><span class="ico">${icon(t.icon)}</span><span>${esc(t.label)}</span><b>${esc(t.value)}</b></button>`
    )
    .join('');
};
