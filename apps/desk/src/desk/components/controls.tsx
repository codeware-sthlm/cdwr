import type { ControlView } from '../model';
import { busy, statusText } from '../view/controls';

// The desk's control buttons as components; shown only with a control token

const MINI_BASE =
  'min-h-[var(--tap)] text-[12px] disabled:cursor-default disabled:opacity-50';
/** The compact control button's utilities, after its `pf-mini` class */
export const MINI = `${MINI_BASE} px-3 py-0`;
const STEP = `${MINI_BASE} min-w-[var(--tap)] p-0`;

/** What the state says next to its button; nothing when idle */
export const ControlStatus = ({ view }: { view: ControlView }) => {
  const text = statusText(view);
  return text ? (
    <small
      className={`ctl-status ${view.state} text-[12px] ${view.state === 'refused' ? 'text-[color:var(--wait)]' : 'text-[color:var(--muted)]'}`}
      role="status"
    >
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
  className = `pf-mini ${MINI}`
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
      <span className="ctl-stepper inline-flex items-center gap-1.5">
        <button
          type="button"
          className={`pf-mini ctl-step ${STEP}`}
          data-step={`${control}:${-range.step}`}
          aria-label="Decrease"
          disabled={off || at <= range.min}
          onClick={() => onStep(-range.step)}
        >
          −
        </button>
        <b className="ctl-draft min-w-[3ch] text-center font-[family-name:var(--font-mono)] text-[13px] leading-[normal] font-semibold tabular-nums">
          {draft === null ? '–' : fmt(draft)}
        </b>
        <button
          type="button"
          className={`pf-mini ctl-step ${STEP}`}
          data-step={`${control}:${range.step}`}
          aria-label="Increase"
          disabled={off || at >= range.max}
          onClick={() => onStep(range.step)}
        >
          +
        </button>
        <button
          type="button"
          className={`pf-mini ctl-apply ${MINI}`}
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
