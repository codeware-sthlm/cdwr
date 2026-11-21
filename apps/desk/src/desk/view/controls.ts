import type { ControlView } from '../model';

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
