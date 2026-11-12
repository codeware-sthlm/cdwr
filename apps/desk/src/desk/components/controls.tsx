import type { ControlView } from '../model';
import { busy, statusText } from '../view/controls';

// The desk's control buttons as components; shown only with a control token

/** What the state says next to its button; nothing when idle */
export const ControlStatus = ({ view }: { view: ControlView }) => {
  const text = statusText(view);
  return text ? (
    <small className={`ctl-status ${view.state}`} role="status">
      {text}
    </small>
  ) : null;
};

type CmdProps = {
  cmd: string;
  label: string;
  view: ControlView;
  onClick: () => void;
  /** The button's class, where it sits among buttons of another style */
  className?: string;
};

export const CmdButton = ({
  cmd,
  label,
  view,
  onClick,
  className = 'pf-mini'
}: CmdProps) => (
  <button
    type="button"
    className={className}
    data-cmd={cmd}
    disabled={busy(view)}
    onClick={onClick}
  >
    {label}
  </button>
);

type StepperProps = {
  control: 'limit' | 'cap';
  range: { min: number; max: number; step: number };
  current: number | null;
  draft: number | null;
  view: ControlView;
  fmt: (n: number) => string;
  onStep: (delta: number) => void;
  onApply: () => void;
};

/** A `−` draft `+` group with Apply; `fmt` formats the draft */
export const Stepper = ({
  control,
  range,
  current,
  draft,
  view,
  fmt,
  onStep,
  onApply
}: StepperProps) => {
  const off = busy(view);
  const at = draft ?? range.min;
  return (
    <>
      <span className="ctl-stepper">
        <button
          type="button"
          className="pf-mini ctl-step"
          data-step={`${control}:${-range.step}`}
          aria-label="Decrease"
          disabled={off || at <= range.min}
          onClick={() => onStep(-range.step)}
        >
          −
        </button>
        <b className="ctl-draft">{draft === null ? '–' : fmt(draft)}</b>
        <button
          type="button"
          className="pf-mini ctl-step"
          data-step={`${control}:${range.step}`}
          aria-label="Increase"
          disabled={off || at >= range.max}
          onClick={() => onStep(range.step)}
        >
          +
        </button>
        <button
          type="button"
          className="pf-mini ctl-apply"
          data-apply={control}
          disabled={off || draft === null || draft === current}
          onClick={onApply}
        >
          Apply
        </button>
      </span>
      <ControlStatus view={view} />
    </>
  );
};
