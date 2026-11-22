import { dayTime } from '../format';
import type { ControlView } from '../model';
import type { NotifyDial, NotifyLevel } from '../types';

// What the desk's control buttons share; shown only with a control token, and they send through
// `sendControl`.

/** The ranges the scheduler accepts, and the cap's step */
export const LIMIT_RANGE = { min: 1, max: 20, step: 1 } as const;
export const CAP_RANGE = { min: 0, max: 500, step: 5 } as const;

/** A control with a command in flight or waiting for the host takes no new one */
export const busy = (view: ControlView): boolean =>
  view.state === 'pending' || view.state === 'sending';

/** What the state says next to its button: empty when idle */
export const statusText = (view: ControlView): string =>
  view.state === 'sending'
    ? 'sending…'
    : view.state === 'pending'
      ? 'pending…'
      : view.state === 'refused'
        ? view.note
        : '';

/** The levels the notify control offers, with what each lets through */
export const NOTIFY_CHOICES: readonly {
  level: NotifyLevel;
  label: string;
}[] = [
  { level: 'urgent', label: 'Urgent' },
  { level: 'action', label: 'Action' },
  { level: 'all', label: 'All' }
];

/** A reported mute as a time that is still ahead of `now`, else null: a mute that has passed reads as none */
export const liveMute = (value: unknown, now: number): number | null => {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return at > now ? at : null;
};

/** When the dial's mute ends, with the day when it is not today; null without a mute still ahead */
export const muteEndText = (
  dial: NotifyDial | undefined,
  now: Date
): string | null => {
  const at = liveMute(dial?.muteUntil, now.getTime());
  return at === null ? null : dayTime(at, now.getTime());
};

/** How long to mute Slack for: not at all, a number of hours, or until the next 08:00 local */
export type MuteChoice = 'none' | '1h' | '4h' | 'morning';

export const MUTE_CHOICES: readonly { mute: MuteChoice; label: string }[] = [
  { mute: 'none', label: 'Unmuted' },
  { mute: '1h', label: '1 hour' },
  { mute: '4h', label: '4 hours' },
  { mute: 'morning', label: 'Until 08:00' }
];

const HOUR_MS = 60 * 60 * 1000;

/** The next 08:00 local time after `now` */
export const nextMorning = (now: Date): Date => {
  const at = new Date(now);
  at.setHours(8, 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
};

/** The UTC time a mute choice ends at, counted from `now`; null for none */
export const muteUntil = (choice: MuteChoice, now: Date): string | null => {
  switch (choice) {
    case 'none':
      return null;
    case '1h':
      return new Date(now.getTime() + HOUR_MS).toISOString();
    case '4h':
      return new Date(now.getTime() + 4 * HOUR_MS).toISOString();
    case 'morning':
      return nextMorning(now).toISOString();
  }
};
