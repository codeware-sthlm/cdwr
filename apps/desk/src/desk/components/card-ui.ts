// The utilities the desk's cards share: the session and Waiting on you cards, and the capacity and Platform cards built on the frame

/** The card frame: padding, radius and border, a column; the callers add the display, the cursor, the gap, the flex basis and the tone */
export const FRAME =
  'card-top min-w-0 flex-col rounded-[var(--r-card)] border px-[22px] py-5 max-[600px]:px-4 max-[600px]:py-3.5';

/** A clickable card on the frame: shown, with the pointer and the card gap */
export const CARD = `${FRAME} flex cursor-pointer gap-3 max-[600px]:gap-2`;

/** A card that is not a control, the capacity and Platform cards: shown, the default cursor, the wider gap and the plain tone */
export const PANEL = `${FRAME} flex cursor-default gap-[14px] border-[color:var(--line)] bg-[color:var(--surface)]`;

/** The card's head: the pill on the left, the count or where it runs on the right */
export const HEAD = 'ct-head flex min-w-0 items-center justify-between gap-3';

/** The pill, a button unboxed by the `all: unset` rule in desk.css that `open` names; the caller adds the colour */
export const OPEN =
  'open state -my-3 inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-2 font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-medium tracking-[0.12em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

/** A line of muted UI text where a card has nothing to list */
export const NONE =
  'none font-[family-name:var(--font-ui)] text-[13px] leading-[normal] font-normal text-[color:var(--muted)]';

/** How long ago, at the end of a row */
export const TIME =
  'flex-none font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
