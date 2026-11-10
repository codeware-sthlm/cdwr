import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@codeware/shared/ui/shadcn/components/collapsible';

import { shortAge } from '../format';
import type { Model } from '../model';
import { livePr, prTone } from '../render/html';
import {
  DESKTOP_ROWS,
  PHONE_ROWS,
  type WaitRow,
  countedRows,
  rowLabel,
  waitRows
} from '../render/waiting';
import type { Detail } from '../state';

import { Prn } from './links';

// The Waiting on you card: everything that waits on you, furthest along first, each with how long it has waited

/** One line per row: the row links to the ticket, the PR number beside it tinted by its state. Notes and buttons are the panel's */
const Row = ({
  m,
  details,
  r
}: {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  r: WaitRow;
}) => {
  const tone = prTone(
    livePr(m, details, { ticket: r.id, pr: r.pr }).live?.state ?? null
  );
  const approved = r.kind === 'approved';
  return (
    <li className={approved ? 'wrow-li approved' : 'wrow-li'}>
      <a
        className="wrow"
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="id">{r.id}</span>
        <span className="t">{r.title}</span>
        <span className="kind" title={approved ? rowLabel(r) : undefined}>
          {rowLabel(r)}
        </span>
        {r.age === null ? null : <time>{shortAge(r.age)}</time>}
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
};

/** The Waiting on you card, with a fold for the snoozed rows */
export const WaitingCard = ({ m, details, now, open, onOpenChange }: Props) => {
  const loading = !m.runs;
  const all = loading ? [] : waitRows(m, details, now);
  const rows = all.filter((r) => !r.snoozed);
  const snoozed = all.filter((r) => r.snoozed);
  const count = countedRows(all).length;
  // One button for both widths: CSS shows it and picks the count per breakpoint
  const desk = rows.length > DESKTOP_ROWS;
  return (
    <article
      className={count ? 'card-top waiting has' : 'card-top waiting'}
      data-w="before"
    >
      <div className="ct-head">
        <button type="button" className="open state" aria-haspopup="dialog">
          Waiting on you
        </button>
        <b className="count">{loading ? '–' : count}</b>
      </div>
      {loading ? (
        <p className="none">Loading…</p>
      ) : rows.length ? (
        <>
          <ul className="wrows">
            {rows.map((r) => (
              <Row key={r.id + r.kind} m={m} details={details} r={r} />
            ))}
          </ul>
          {rows.length > PHONE_ROWS ? (
            <button
              type="button"
              className={desk ? 'more-all more-desk' : 'more-all'}
              aria-haspopup="dialog"
            >
              + <span className="more-n phone">{rows.length - PHONE_ROWS}</span>
              {desk ? (
                <span className="more-n desk">
                  {rows.length - DESKTOP_ROWS}
                </span>
              ) : null}{' '}
              more — open all
            </button>
          ) : null}
        </>
      ) : (
        <p className="none">Nothing waits on you.</p>
      )}
      {!loading && snoozed.length ? (
        <Collapsible
          className="snoozed"
          open={open}
          onOpenChange={onOpenChange}
        >
          <CollapsibleTrigger className="snoozed-summary">
            Snoozed · {snoozed.length}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="wrows">
              {snoozed.map((r) => (
                <Row key={r.id + r.kind} m={m} details={details} r={r} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {rows.length ? (
        <p className="foot">
          wait age from activity gate events · answering unblocks the next run
        </p>
      ) : null}
    </article>
  );
};
