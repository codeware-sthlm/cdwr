import { type Model, prOf } from '../model';
import type { DeskState } from '../state';
import type { QueueTreeNode } from '../types';

import { CAP_SUB } from './capacity';
import { Chip, Empty } from './items';
import { META, RULE, TITLE } from './items-ui';
import { IdLink, Prn } from './links';

// The ticket tree view: each root with the sub-issues the scheduler's queue view carries

const STATE_NAME: ReadonlyMap<string, string> = new Map([
  ['triage', 'triage'],
  ['backlog', 'backlog'],
  ['unstarted', 'todo'],
  ['started', 'in progress'],
  ['completed', 'done'],
  ['canceled', 'canceled']
]);

const ROW = 'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 py-1';
// A child's list hangs off its root with a left rule
const NEST = 'ml-1.5 grid gap-0.5 border-l border-[color:var(--line)] pl-3.5';
const DIM = 'opacity-60';

/** One ticket's row and, under a root, its children */
const Node = ({
  node,
  m,
  details
}: {
  node: QueueTreeNode;
  m: Model;
  details: DeskState['details'];
}) => {
  const i = m.get(node.ticket);
  const title = node.title || i.title;
  const done = node.state === 'completed' || node.state === 'canceled';
  const label = node.label?.replace(/^agent:/, '');
  return (
    <li>
      <div className={done ? `${ROW} ${DIM}` : ROW}>
        <IdLink id={node.ticket} />
        {title ? (
          <a
            className={TITLE}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {title}
          </a>
        ) : null}
        {node.state ? (
          <span className={META}>
            {STATE_NAME.get(node.state) ?? node.state}
          </span>
        ) : null}
        {label ? <Chip kind={label}>{label}</Chip> : null}
        <Prn n={prOf(details, node.ticket, node.pr)} />
        {node.blockers.map((b) => (
          <Chip key={b} kind="blocked">
            blocked by <IdLink id={b} />
          </Chip>
        ))}
        {node.gaps.map((g) => (
          <Chip key={g} kind="conflict">
            {g}
          </Chip>
        ))}
      </div>
      {node.truncated ? (
        <p className={`${META} pl-3.5`}>more sub-issues than the query reads</p>
      ) : null}
      {node.children.length ? (
        <ul className={NEST}>
          {node.children.map((c) => (
            <Node key={c.ticket} node={c} m={m} details={details} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

type Props = {
  m: Model;
  details: DeskState['details'];
  onDesk: () => void;
};

export const TreePage = ({ m, details, onDesk }: Props) => (
  <>
    <div className="pf-head flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        className="pf-back min-h-[var(--tap)] px-3.5"
        data-view="desk"
        onClick={onDesk}
      >
        ‹ Desk
      </button>
      <div className="pf-title mr-auto flex min-w-0 flex-col gap-0.5">
        <h1
          id="tree-title"
          tabIndex={-1}
          className="font-[family-name:var(--font-ui)] text-[22px] leading-[1.2] font-semibold tracking-[0.18em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]"
        >
          Ticket tree
        </h1>
        <span className={`cap-sub ${CAP_SUB}`}>
          every agent ticket where it sits in its split: state, agent label, PR,
          blockers and gaps
        </span>
      </div>
    </div>
    {m.tree.length ? (
      <ul className="grid gap-2">
        {m.tree.map((root) => (
          <Node key={root.ticket} node={root} m={m} details={details} />
        ))}
      </ul>
    ) : (
      <Empty>No agent ticket in flight.</Empty>
    )}
    <p className={RULE}>
      Agent tickets with their parents and sub-issues, Done ones for 14 days,
      from the scheduler&apos;s queue view. An open blocker shows as a
      &quot;blocked by&quot; chip, a gap from the audit as a chip of its kind,
      as in the Next sheet&apos;s Gaps.
    </p>
  </>
);
