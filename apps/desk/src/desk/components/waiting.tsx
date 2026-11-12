import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@codeware/shared/ui/shadcn/components/collapsible';
import type { MouseEventHandler } from 'react';

import { shortAge } from '../format';
import type { Model } from '../model';
import type { Detail } from '../state';
import { livePr, prTone } from '../view/pr';
import {
  DESKTOP_ROWS,
  PHONE_ROWS,
  type WaitRow,
  countedRows,
  rowLabel,
  waitRows
} from '../view/waiting';

import { CARD, HEAD, NONE, OPEN, TIME } from './card-ui';
import { Prn } from './links';

// The Waiting on you card: everything that waits on you, furthest along first, each with how long it has waited

/** One line per row: the row links to the ticket, the PR number beside it tinted by its state. Notes and buttons are the panel's */
const Row = ({
  m,
  details,
  r,
  capped
}: {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  r: WaitRow;
  /** Whether the card shows only its first rows, the rest behind "open all" */
  capped?: boolean;
}) => {
  const tone = prTone(
    livePr(m, details, { ticket: r.id, pr: r.pr }).live?.state ?? null
  );
  const approved = r.kind === 'approved';
  // A snoozed or approved row is quiet: no fill, no hover, the kind in grey
  const quiet = approved || r.snoozed;
  const li = capped
    ? 'wrow-li flex min-w-0 flex-nowrap items-center gap-2.5 nth-[n+5]:hidden max-[600px]:nth-[n+3]:hidden [&_.prn]:shrink-0'
    : 'wrow-li flex min-w-0 flex-nowrap items-center gap-2.5 [&_.prn]:shrink-0';
  const row = quiet
    ? 'wrow flex min-h-[var(--tap)] min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-row)] border border-[color:var(--line)] bg-transparent px-3.5 py-2 text-[color:var(--fg)] max-[600px]:gap-2 max-[600px]:px-3'
    : 'wrow flex min-h-[var(--tap)] min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-row)] border border-[color:var(--wait-line)] bg-[color:var(--wait-soft)] px-3.5 py-2 text-[color:var(--fg)] hover:border-[color:var(--wait-dash)] max-[600px]:gap-2 max-[600px]:px-3';
  // An approved row's label carries the blocker list, so it shrinks to an ellipsis instead of pushing the age off a phone
  const kind = approved
    ? 'kind ml-auto min-w-0 flex-[0_1_auto] overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-[color:var(--muted)]'
    : quiet
      ? 'kind ml-auto flex-none text-[11px] text-[color:var(--muted)]'
      : 'kind ml-auto flex-none text-[11px] text-[color:var(--wait)]';
  return (
    <li className={approved ? `${li} approved` : li}>
      <a className={row} href={r.url} target="_blank" rel="noopener noreferrer">
        <span className="id flex-none font-[family-name:var(--font-mono)] text-[12px] leading-[normal] font-semibold">
          {r.id}
        </span>
        <span className="t min-w-0 flex-[1_1_auto] overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-[color:var(--muted)]">
          {r.title}
        </span>
        <span className={kind} title={approved ? rowLabel(r) : undefined}>
          {rowLabel(r)}
        </span>
        {r.age === null ? null : (
          <time className={TIME}>{shortAge(r.age)}</time>
        )}
      </a>
      <Prn n={r.pr} tone={tone} />
    </li>
  );
};

type Props = {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  now: Date;
  /** Whether the fold of snoozed rows is open */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A click on the card, which opens its sheet */
  onClick?: MouseEventHandler<HTMLElement>;
};

/** The Waiting on you card, with a fold for the snoozed rows */
export const WaitingCard = ({
  m,
  details,
  now,
  open,
  onOpenChange,
  onClick
}: Props) => {
  const loading = !m.runs;
  const all = loading ? [] : waitRows(m, details, now);
  const rows = all.filter((r) => !r.snoozed);
  const snoozed = all.filter((r) => r.snoozed);
  const count = countedRows(all).length;
  // One button for both widths: CSS shows it and picks the count per breakpoint
  const desk = rows.length > DESKTOP_ROWS;
  return (
    <article
      className={
        count
          ? `${CARD} waiting has flex-[2_1_380px] border-[color:var(--wait-line)] bg-[color:var(--wait-card)] hover:border-[color:var(--wait-dash)]`
          : `${CARD} waiting flex-[2_1_380px] border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--line-strong)]`
      }
      data-w="before"
      onClick={onClick}
    >
      <div className={HEAD}>
        <button
          type="button"
          className={
            count
              ? `${OPEN} text-[color:var(--wait)]`
              : `${OPEN} text-[color:var(--muted)]`
          }
          aria-haspopup="dialog"
        >
          Waiting on you
        </button>
        <b
          className={
            count
              ? 'count font-[family-name:var(--font-mono)] text-[30px] leading-none font-semibold text-[color:var(--wait)] max-[600px]:text-[22px]'
              : 'count font-[family-name:var(--font-mono)] text-[30px] leading-none font-semibold text-[color:var(--muted)] max-[600px]:text-[22px]'
          }
        >
          {loading ? '–' : count}
        </b>
      </div>
      {loading ? (
        <p className={NONE}>Loading…</p>
      ) : rows.length ? (
        <>
          <ul className="wrows flex flex-col gap-2">
            {rows.map((r) => (
              <Row key={r.id + r.kind} m={m} details={details} r={r} capped />
            ))}
          </ul>
          {rows.length > PHONE_ROWS ? (
            <button
              type="button"
              className={
                desk
                  ? 'more-all more-desk block min-h-[var(--tap)] border border-dashed border-[color:var(--wait-line)] bg-transparent text-[12px] text-[color:var(--wait)]'
                  : 'more-all hidden min-h-[var(--tap)] border border-dashed border-[color:var(--wait-line)] bg-transparent text-[12px] text-[color:var(--wait)] max-[600px]:block'
              }
              aria-haspopup="dialog"
            >
              +{' '}
              <span className="more-n phone hidden max-[600px]:inline">
                {rows.length - PHONE_ROWS}
              </span>
              {desk ? (
                <span className="more-n desk max-[600px]:hidden">
                  {rows.length - DESKTOP_ROWS}
                </span>
              ) : null}{' '}
              more — open all
            </button>
          ) : null}
        </>
      ) : (
        <p className={NONE}>Nothing waits on you.</p>
      )}
      {!loading && snoozed.length ? (
        <Collapsible
          className="snoozed mt-1"
          open={open}
          onOpenChange={onOpenChange}
        >
          <CollapsibleTrigger className="snoozed-summary cursor-pointer border-0 bg-transparent p-0 text-left font-[family-name:inherit] text-[11px] text-[color:var(--muted)] before:content-['▸_'] data-[state=open]:mb-2 data-[state=open]:before:content-['▾_']">
            Snoozed · {snoozed.length}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="wrows flex flex-col gap-2">
              {snoozed.map((r) => (
                <Row key={r.id + r.kind} m={m} details={details} r={r} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {rows.length ? (
        <p className="foot text-[11px] text-[color:var(--muted)]">
          wait age from activity gate events · answering unblocks the next run
        </p>
      ) : null}
    </article>
  );
};
