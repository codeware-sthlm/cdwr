import type { ReactNode } from 'react';

import { LIMIT } from '../constants';
import { tidy } from '../format';
import type { Model, TicketRef } from '../model';
import type { Detail } from '../state';
import { reasonChipData } from '../view/labels';

import {
  BAR,
  CHIP,
  CHIP_KIND,
  EMPTY,
  ID,
  MAIN,
  META,
  NEXT,
  PRIO_TEXT,
  RANK,
  SIDE,
  TITLE,
  itemClass
} from './items-ui';
import { LinkIds } from './links';
import { PV_MORE, TBL, TBL_CELL, TBL_HEAD } from './sheet-ui';

// The row helpers of the sheets; their utilities are in items-ui.ts

/** Linear's priority values by name */
export const PRIO: ReadonlyMap<number, string> = new Map([
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
    <li className={itemClass(state || '')}>
      <span className={RANK}>{rank ?? ''}</span>
      <div className={MAIN}>
        <a
          className={TITLE}
          href={i.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={ID}>{i.id}</span>
          {i.title}
        </a>
        {i.status ? (
          <div className={META}>
            <span className={PRIO_TEXT} title={prioName}>
              {PRIO_MARK.get(prio) ?? PRIO_MARK.get(0)} {prioName}
            </span>
            <span>· {i.status}</span>
          </div>
        ) : null}
        {d && d.steps ? (
          <div className={META}>
            <div className={`${BAR} w-[120px]`} aria-hidden="true">
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
          <div className={META}>{note}</div>
        ) : d?.next && showNext ? (
          <div className={NEXT}>
            <LinkIds text={tidy(d.next)} />
          </div>
        ) : null}
      </div>
      <span className={SIDE}>{side}</span>
    </li>
  );
};

/** A line standing in for a list with nothing in it */
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className={EMPTY}>{children}</div>
);

/** A small label; `kind` is its class and picks its colours */
export const Chip = ({
  kind,
  children
}: {
  kind: string;
  children: ReactNode;
}) => (
  <span className={`${CHIP} ${kind} ${CHIP_KIND[kind] ?? ''}`}>{children}</span>
);

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
    <div
      className="h-2 overflow-hidden rounded-[4px] bg-[color:var(--sunk)]"
      aria-hidden="true"
    >
      <i
        className="block h-full"
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
  n > 0 ? <p className={PV_MORE}>+ {n} more</p> : null;

/** A table of cells, in a box that scrolls sideways when it must */
export const Table = ({
  head,
  rows
}: {
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) => (
  <div className="overflow-x-auto">
    <table className={TBL}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className={TBL_HEAD}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, n) => (
          <tr key={n}>
            {r.map((c, k) => (
              <td key={k} className={TBL_CELL}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
