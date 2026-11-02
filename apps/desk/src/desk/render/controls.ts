import { esc } from '../format';
import type { ControlView } from '../model';

// The desk's control buttons; shown only with a control token, and they send through `sendControl`

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

export const status = (view: ControlView): string => {
  const text = statusText(view);
  return text
    ? `<small class="ctl-status ${view.state}" role="status">${esc(text)}</small>`
    : '';
};

export const cmdButton = (
  cmd: string,
  label: string,
  view: ControlView,
  cls = 'pf-mini',
  extra = ''
): string =>
  `<button type="button" class="${cls}" data-cmd="${cmd}"${extra}${busy(view) ? ' disabled' : ''}>${esc(label)}</button>`;

/** A `−` draft `+` group with Apply; `fmt` formats the draft */
export const stepper = (
  control: 'limit' | 'cap',
  range: { min: number; max: number; step: number },
  current: number | null,
  draft: number | null,
  view: ControlView,
  fmt: (n: number) => string
): string => {
  const off = busy(view);
  const at = draft ?? range.min;
  const down = off || at <= range.min ? ' disabled' : '';
  const up = off || at >= range.max ? ' disabled' : '';
  const apply = off || draft === null || draft === current ? ' disabled' : '';
  return `<span class="ctl-stepper">
      <button type="button" class="pf-mini ctl-step" data-step="${control}:${-range.step}" aria-label="Decrease"${down}>−</button>
      <b class="ctl-draft">${esc(draft === null ? '–' : fmt(draft))}</b>
      <button type="button" class="pf-mini ctl-step" data-step="${control}:${range.step}" aria-label="Increase"${up}>+</button>
      <button type="button" class="pf-mini ctl-apply" data-apply="${control}"${apply}>Apply</button>
    </span>${status(view)}`;
};
