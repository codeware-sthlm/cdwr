import type { ReactNode } from 'react';

import { LIMIT } from '../constants';
import { tidy } from '../format';
import type { Model, TicketRef } from '../model';
import { reasonChipData } from '../render/html';
import type { Detail } from '../state';

import { LinkIds } from './links';

// The row helpers of the sheets, with the same elements and classes the HTML versions had

const PRIO: ReadonlyMap<number, string> = new Map([
  [1, 'Urgent'],
  [2, 'High'],
  [3, 'Medium'],
  [4, 'Low'],
  [0, 'None']
]);
const PRIO_MARK: ReadonlyMap<number, string> = new Map([
  [1, '!!!'],
  [2, '▲▲'],
  [3, '▲'],
  [4, '▽'],
  [0, '–']
]);

/** A ticket row: its title, priority and status, plan progress and a meta line or the next step */
export const Item = ({
  details,
  i,
  state,
  rank,
  note,
  showNext,
  side
}: {
  details: ReadonlyMap<string, Detail>;
  i: TicketRef;
  /** The row's class: an Agent state or `plain` */
  state?: string;
  rank?: number | string;
  /** Shown as the row's meta line, ahead of the next step */
  note?: ReactNode;
  showNext?: boolean;
  /** At the row's right edge */
  side?: ReactNode;
}) => {
  const d = details.get(i.id);
  const prio = i.priority?.value ?? 0;
  const prioName = PRIO.get(prio) ?? PRIO.get(0);
  return (
    <li className={`item ${state || ''}`.trim()}>
      <span className="rank">{rank ?? ''}</span>
      <div className="main">
        <a
          className="title"
          href={i.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="id">{i.id}</span>
          {i.title}
        </a>
        {i.status ? (
          <div className="meta">
            <span className="prio" title={prioName}>
              {PRIO_MARK.get(prio) ?? PRIO_MARK.get(0)} {prioName}
            </span>
            <span>· {i.status}</span>
          </div>
        ) : null}
        {d && d.steps ? (
          <div className="meta">
            <div className="bar" aria-hidden="true">
              <i
                style={{ width: `${Math.round((d.done / d.steps) * 100)}%` }}
              ></i>
            </div>
            <span>
              {d.done}/{d.steps} steps
            </span>
          </div>
        ) : null}
        {note ? (
          <div className="meta">{note}</div>
        ) : d?.next && showNext ? (
          <div className="next">
            <LinkIds text={tidy(d.next)} />
          </div>
        ) : null}
      </div>
      <span className="side">{side}</span>
    </li>
  );
};

/** A line standing in for a list with nothing in it */
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="empty">{children}</div>
);

/** A small label; `kind` is its class */
export const Chip = ({
  kind,
  children
}: {
  kind: string;
  children: ReactNode;
}) => <span className={`chip ${kind}`}>{children}</span>;

/** Why a ticket is queued, as a chip */
export const ReasonChip = ({ reason }: { reason: string | undefined }) => {
  const [text, kind] = reasonChipData(reason);
  return <Chip kind={kind}>{text}</Chip>;
};

/** The meter under the limit: green, then amber one below the limit, then red */
export const LoadMeter = ({ m }: { m: Pick<Model, 'limit'> }) => {
  const n = m.limit.used,
    max = m.limit.max || LIMIT;
  return (
    <div className="meter" aria-hidden="true">
      <i
        style={{
          width: `${Math.min(100, (n / max) * 100)}%`,
          background: `var(${n >= max ? '--block' : n >= max - 1 ? '--wait' : '--ok'})`
        }}
      ></i>
    </div>
  );
};

/** "+ 3 more" under a preview; nothing when all fit */
export const PvMore = ({ n }: { n: number }) =>
  n > 0 ? <p className="pv-more">+ {n} more</p> : null;

/** A table of cells, in a box that scrolls sideways when it must */
export const Table = ({
  head,
  rows
}: {
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) => (
  <div className="tblwrap">
    <table className="tbl">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, n) => (
          <tr key={n}>
            {r.map((c, k) => (
              <td key={k}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
