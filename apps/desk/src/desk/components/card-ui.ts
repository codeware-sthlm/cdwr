// The utilities the session card and the Waiting on you card share

/** The card: padding, gap and frame; the callers add the flex basis and the tone */
export const CARD =
  'card-top flex min-w-0 cursor-pointer flex-col gap-3 rounded-[var(--r-card)] border px-[22px] py-5 max-[600px]:gap-2 max-[600px]:px-4 max-[600px]:py-3.5';

/** The card's head: the pill on the left, the count or where it runs on the right */
export const HEAD = 'ct-head flex min-w-0 items-center justify-between gap-3';

/** The pill, a button unboxed by the `all: unset` rule in desk.css; the caller adds the colour */
export const OPEN =
  'open state -my-3 inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-2 font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-medium tracking-[0.12em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

/** A line of muted UI text where a card has nothing to list */
export const NONE =
  'none font-[family-name:var(--font-ui)] text-[13px] leading-[normal] font-normal text-[color:var(--muted)]';

/** How long ago, at the end of a row */
export const TIME =
  'flex-none font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
