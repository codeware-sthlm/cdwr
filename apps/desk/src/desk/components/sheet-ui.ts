import type { Role } from '../constants';

// The utilities the data and scheduler sheets share

/** A row of figures: a bold number over a muted label, per child div */
export const PV_STATS =
  'pv-stats flex flex-wrap gap-x-[18px] gap-y-2 [&>div]:grid [&>div]:gap-0.5 [&_b]:font-[family-name:var(--font-ui)] [&_b]:text-[1.1rem] [&_b]:leading-none [&_b]:font-semibold [&_b]:tabular-nums [&_span]:text-[0.75rem] [&_span]:text-[color:var(--muted)]';

/** A list of bold terms, each over a muted explanation */
export const KNOBS =
  'knobs [&_li]:grid [&_li]:gap-0.5 [&_li]:text-[0.85rem] [&_b]:font-semibold [&_span]:text-[0.8rem] [&_span]:text-[color:var(--muted)]';

/** A definition list as two columns of term and value */
export const KV =
  'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.88rem] [&_dt]:text-[color:var(--muted)] [&_dd]:[overflow-wrap:anywhere]';

/** The plan windows, as many columns as fit */
export const FIGS =
  'grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-5 gap-y-4';

/** One figure: its head, the gauge or sparkline, a note */
export const FIG = 'grid content-start gap-1.5';

/** A figure's head: the title on its own line, then the number and a muted label */
export const FIGH =
  'flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 [&_h3]:flex-[1_1_100%] [&_h3]:text-[1.17em] [&_h3]:font-bold [&_b]:font-[family-name:var(--font-ui)] [&_b]:text-[1.1rem] [&_b]:leading-none [&_b]:font-semibold [&_b]:tabular-nums [&_b.bad]:text-[color:var(--block)] [&_span]:text-[0.75rem] [&_span]:text-[color:var(--muted)]';

/** The warning colour of a stale sample or update time */
export const STALE = 'font-semibold text-[color:var(--wait)]';

/** A muted note under a preview or a list */
export const PV_MORE = 'text-[0.8rem] text-[color:var(--muted)]';

/** The spend roles' colours, as a background and as an SVG fill */
export const ROLE_BG: Record<Role, string> = {
  planning: 'bg-[color:var(--r-planning)]',
  orchestrating: 'bg-[color:var(--r-orchestrating)]',
  implementing: 'bg-[color:var(--r-implementing)]'
};
export const ROLE_FILL: Record<Role, string> = {
  planning: 'fill-[color:var(--r-planning)]',
  orchestrating: 'fill-[color:var(--r-orchestrating)]',
  implementing: 'fill-[color:var(--r-implementing)]'
};

/** A table: right-aligned figures, the first column on the left */
export const TBL = 'w-full border-collapse text-[0.8rem] tabular-nums';
export const TBL_CELL =
  'border-b border-[color:var(--line)] px-1.5 py-1 text-right whitespace-nowrap first:text-left';
export const TBL_HEAD = `${TBL_CELL} font-semibold text-[color:var(--muted)]`;
