import type { PrTone } from '../view/pr';

// The utilities the sheets' rows and inline marks share: ticket rows, ids, pills and chips

/** A ticket or PR id: small and muted; the caller adds the underline of a link and the gap after it */
const ID_TEXT =
  'id font-[family-name:var(--font-mono)] text-[0.78rem] leading-[normal] font-normal text-[color:var(--muted)]';

/** An id with its gap to the text that follows */
export const ID = `${ID_TEXT} mr-1.5`;

/** An id link: Preflight takes the underline off links, and an id keeps it */
export const ID_LINK = `${ID} underline`;

/** An id link with no gap after it */
export const ID_LINK_FLUSH = `${ID_TEXT} underline`;

/** A PR number as a link, in the accent colour; `PRN_TONE` tints it by the PR's live state */
export const PRN =
  'prn font-[family-name:var(--font-mono)] text-[0.8rem] leading-[normal] font-medium tabular-nums hover:underline';
export const PRN_TONE: Record<PrTone, string> = {
  neutral: 'text-[color:var(--accent)]',
  ok: 'text-[color:var(--ok)]',
  wait: 'text-[color:var(--wait)]',
  bad: 'text-[color:var(--block)]'
};

/** The PR state pill; its tone sets the text, fill and frame colours */
export const PILL =
  'pill inline-block rounded-[var(--r-pill)] border px-2.5 py-[3px] text-[11px]';
export const PILL_TONE: Record<PrTone, string> = {
  wait: 'border-[color:var(--wait-line)] bg-[color:var(--wait-soft)] text-[color:var(--wait)]',
  ok: 'border-[color:color-mix(in_srgb,var(--ok)_30%,var(--ok-soft))] bg-[color:var(--ok-soft)] text-[color:var(--ok)]',
  bad: 'border-[color:color-mix(in_srgb,var(--block)_30%,var(--block-soft))] bg-[color:var(--block-soft)] text-[color:var(--block)]',
  neutral:
    'border-[color:var(--line-strong)] bg-[color:var(--control)] text-[color:var(--muted)]'
};

/** A small label; the colours by kind, a kind that is not listed has none */
export const CHIP =
  'chip inline-block rounded-[var(--r-pill)] px-2 py-px text-[0.74rem] font-semibold';
const CHIP_OK = 'bg-[color:var(--ok-soft)] text-[color:var(--ok)]';
const CHIP_WORK = 'bg-[color:var(--work-soft)] text-[color:var(--work)]';
const CHIP_WAIT = 'bg-[color:var(--wait-soft)] text-[color:var(--wait)]';
const CHIP_REVIEW = 'bg-[color:var(--review-soft)] text-[color:var(--review)]';
const CHIP_BLOCK = 'bg-[color:var(--block-soft)] text-[color:var(--block)]';
export const CHIP_KIND: Record<string, string> = {
  ready: CHIP_OK,
  answered: CHIP_OK,
  working: CHIP_WORK,
  resume: CHIP_WORK,
  'needs-input': CHIP_WAIT,
  takeover: CHIP_WAIT,
  parked: CHIP_WAIT,
  review: CHIP_REVIEW,
  conflict: CHIP_REVIEW,
  comment: CHIP_REVIEW,
  renovate: CHIP_REVIEW,
  feedback: CHIP_REVIEW,
  blocked: CHIP_BLOCK,
  held: 'bg-[color:var(--sunk)] text-[color:var(--muted)]'
};

/** A ticket row: a grid of rank, text and side with a coloured left edge by Agent state; `plain` has none */
const ITEM =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-[10px] border border-[color:var(--line)] px-3 py-2.5';
const ITEM_EDGE: Record<string, string> = {
  ready: 'border-l-4 border-l-[color:var(--ok)]',
  answered: 'border-l-4 border-l-[color:var(--ok)]',
  working: 'border-l-4 border-l-[color:var(--work)]',
  'needs-input': 'border-l-4 border-l-[color:var(--wait)]',
  review: 'border-l-4 border-l-[color:var(--review)]',
  blocked: 'border-l-4 border-l-[color:var(--block)]',
  plain: ''
};

/** The class of a ticket row in `state`: its markers and utilities */
export const itemClass = (state: string): string =>
  `item ${state} ${ITEM} ${ITEM_EDGE[state] ?? 'border-l-4'}`.replace(
    /\s+/g,
    ' '
  );

/** The row's position, a ticket's text column, its title link, meta line and right edge */
export const RANK =
  'rank min-w-[1.4em] font-[family-name:var(--font-mono)] text-[0.85rem] leading-[normal] font-medium text-[color:var(--muted)] tabular-nums';
export const MAIN = 'main grid min-w-0 gap-1';
export const TITLE =
  'title font-medium text-[color:var(--fg)] [overflow-wrap:anywhere] hover:underline';
export const META =
  'meta flex flex-wrap items-center gap-1.5 text-[0.78rem] text-[color:var(--muted)]';
export const SIDE =
  'side text-right text-[0.78rem] whitespace-nowrap text-[color:var(--muted)]';
export const PRIO_TEXT =
  'prio font-[family-name:var(--font-mono)] text-[0.78rem] leading-[normal] font-normal';

/** The next step of a ticket, led by a muted "Next" */
export const NEXT =
  "next text-[0.85rem] text-[color:var(--fg)] [overflow-wrap:anywhere] before:font-semibold before:text-[color:var(--muted)] before:content-['Next_']";

/** A plan's progress bar: the track and the fill, an `i`; the caller sets the width */
export const BAR =
  'bar h-1.5 overflow-hidden rounded-[3px] bg-[color:var(--line)] [&>i]:block [&>i]:h-full [&>i]:bg-[color:var(--work)]';

/** A titled group of rows: its h3 is a small uppercase heading */
export const GROUP =
  'group grid gap-2 [&>h3]:text-[0.72rem] [&>h3]:font-semibold [&>h3]:tracking-[0.08em] [&>h3]:text-[color:var(--muted)] [&>h3]:uppercase';

/** A line standing in for a list with nothing in it, and a muted note under one */
export const EMPTY =
  'empty rounded-[10px] border border-dashed border-[color:var(--line)] p-4 text-[0.9rem] text-[color:var(--muted)]';
export const RULE = 'rule text-[0.8rem] text-[color:var(--muted)]';

/** A card of a ticket and its hand-off checklist, and a checklist item with its empty box */
export const HO =
  'grid min-w-0 content-start gap-2 rounded-[10px] border border-[color:var(--line)] px-3.5 py-3';
export const CHECKS = 'checks gap-1';
export const CHECK_LI =
  "grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[0.88rem] [overflow-wrap:anywhere] before:mt-1 before:size-3 before:rounded-[3px] before:border-[1.5px] before:border-[color:var(--wait)] before:content-['']";
