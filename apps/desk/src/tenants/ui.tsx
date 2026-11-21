import type { Tone } from './cells';
import type { TenantStatus } from './status';

// The tone classes the tenant view shares: the chip, the text and the dot, in the colours the Agent health view uses

const MONO = 'font-[family-name:var(--font-mono)] leading-[normal]';

const CHIP_TONE: Record<Tone, string> = {
  ok: 'bg-[color:var(--ok-soft)] text-[color:var(--ok)]',
  wait: 'bg-[color:var(--wait-soft)] text-[color:var(--wait)]',
  bad: 'bg-[color:var(--block-soft)] text-[color:var(--block)]',
  muted: 'bg-[color:var(--sunk)] text-[color:var(--muted)]'
};

export const TEXT_TONE: Record<Tone, string> = {
  ok: 'text-[color:var(--ok)]',
  wait: 'text-[color:var(--wait)]',
  bad: 'text-[color:var(--block)]',
  muted: 'text-[color:var(--muted)]'
};

/** The dot colour of a status: the pill's worst-status mark */
export const DOT_TONE: Record<TenantStatus, string> = {
  ok: 'bg-[color:var(--live)]',
  warn: 'bg-[color:var(--wait)]',
  down: 'bg-[color:var(--block)]',
  off: 'bg-[color:var(--faint)]'
};

export const STATUS_TONE: Record<TenantStatus, Tone> = {
  ok: 'ok',
  warn: 'wait',
  down: 'bad',
  off: 'muted'
};

/** A small label in a tone */
export const Chip = ({ text, tone }: { text: string; tone: Tone }) => (
  <span
    className={`tn-chip ${tone} ${MONO} rounded-[var(--r-pill)] px-2 py-px text-[10px] font-medium tracking-[0.1em] whitespace-nowrap ${CHIP_TONE[tone]}`}
  >
    {text}
  </span>
);

/** The status chip of a row */
export const StatusChip = ({ status }: { status: TenantStatus }) => (
  <Chip text={status} tone={STATUS_TONE[status]} />
);
