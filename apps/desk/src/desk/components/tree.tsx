import { ageText } from '../format';
import { type Model, prOf } from '../model';
import type { DeskState, TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';
import { whereText } from '../view/session';
import { filterTree, finished } from '../view/tree';
import { mergeBlocker } from '../view/waiting';

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
const SCOPES: readonly (readonly [TreeFilter['scope'], string])[] = [
  ['open', 'Open'],
  ['all', 'All']
];
const UNPRESSED =
  'aria-[pressed=false]:border-[color:var(--line)] aria-[pressed=false]:bg-transparent aria-[pressed=false]:text-[color:var(--muted)]';

/** One ticket's row and, under a root, its children */
const Node = ({
  node,
  m,
  details,
  now
}: {
  node: QueueTreeNode;
  m: Model;
  details: DeskState['details'];
  now: Date;
}) => {
  const i = m.get(node.ticket);
  const title = node.title || i.title;
  const done = finished(node);
  const label = node.label?.replace(/^agent:/, '');
  const detail = details.get(node.ticket);
  const plan = detail && detail.steps > 0 ? detail : null;
  const s = m.session;
  const live =
    s?.ticket === node.ticket && (s.state === 'alive' || s.state === 'waiting');
  const where = live ? whereText(m).replace(/^\S+ on /, '') : '';
  // A watch entry counts for the ticket's PR, not for an older one
  const pr = prOf(details, node.ticket, node.pr);
  const entry = m.watch.get(node.ticket)?.entry;
  const watched =
    entry && (pr === null || String(entry.pr) === String(pr)) ? entry : null;
  const blocker = watched ? mergeBlocker(watched) : null;
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
        <Prn n={pr} />
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
        {plan ? (
          <span className={META}>{`plan ${plan.done}/${plan.steps}`}</span>
        ) : null}
        {live ? (
          <Chip
            kind={m.session?.state === 'waiting' ? 'needs-input' : 'working'}
          >
            {where ? `session · ${where}` : 'session'}
          </Chip>
        ) : null}
        {watched ? (
          <Chip kind={blocker === null ? 'ready' : 'review'}>
            {blocker ?? 'mergeable'}
          </Chip>
        ) : null}
        {i.updatedAt ? (
          <span className={META}>
            {`updated ${ageText((now.getTime() - Date.parse(i.updatedAt)) / 6e4)}`}
          </span>
        ) : null}
      </div>
      {node.truncated ? (
        <p className={`${META} pl-3.5`}>more sub-issues than the query reads</p>
      ) : null}
      {node.children.length ? (
        <ul className={NEST}>
          {node.children.map((c) => (
            <Node key={c.ticket} node={c} m={m} details={details} now={now} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

type Props = {
  m: Model;
  details: DeskState['details'];
  now: Date;
  filter: TreeFilter;
  onFilter: (filter: TreeFilter) => void;
  onDesk: () => void;
};

/** The filters' buttons: a segmented choice, or a toggle for `gaps` */
const Filters = ({ filter, onFilter }: Pick<Props, 'filter' | 'onFilter'>) => (
  <div
    className="filters flex flex-wrap gap-1.5"
    role="group"
    aria-label="Filter"
  >
    {SCOPES.map(([scope, text]) => (
      <button
        key={scope}
        type="button"
        className={UNPRESSED}
        data-scope={scope}
        aria-pressed={filter.scope === scope}
        onClick={() => onFilter({ ...filter, scope })}
      >
        {text}
      </button>
    ))}
    <button
      type="button"
      className={UNPRESSED}
      data-gaps=""
      aria-pressed={filter.gaps}
      onClick={() => onFilter({ ...filter, gaps: !filter.gaps })}
    >
      Gaps only
    </button>
  </div>
);

export const TreePage = ({
  m,
  details,
  now,
  filter,
  onFilter,
  onDesk
}: Props) => {
  const roots = filterTree(m.tree, filter);
  return (
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
            every agent ticket where it sits in its split: state, agent label,
            PR, blockers and gaps
          </span>
        </div>
      </div>
      <Filters filter={filter} onFilter={onFilter} />
      {roots.length ? (
        <ul className="grid gap-2">
          {roots.map((root) => (
            <Node
              key={root.ticket}
              node={root}
              m={m}
              details={details}
              now={now}
            />
          ))}
        </ul>
      ) : m.tree.length ? (
        <Empty>No ticket matches the filter.</Empty>
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
};
