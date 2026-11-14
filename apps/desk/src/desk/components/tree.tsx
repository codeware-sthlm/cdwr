import type { ReviewFinding } from '@codeware/shared/util/agent-review';
import type { ReactNode } from 'react';

import { ageText } from '../format';
import { type Model, prOf } from '../model';
import type { DeskState, TreeFilter } from '../state';
import type { QueueTreeNode } from '../types';
import { whereText } from '../view/session';
import { filterTree, finished, finishedInFull, worstChild } from '../view/tree';
import { mergeBlocker } from '../view/waiting';

import { CAP_SUB } from './capacity';
import { Icon } from './icon';
import { Chip, Empty } from './items';
import { META, RULE } from './items-ui';
import { IdLink, Prn, TicketButton } from './links';
import { FindingChip } from './review';

// The ticket tree view: each root with the sub-issues the scheduler's queue view carries

/** A Linear state type: its name and the chip kind that colours it */
const STATE: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['triage', ['triage', 'backlog']],
  ['backlog', ['backlog', 'backlog']],
  ['unstarted', ['todo', 'todo']],
  ['started', ['in progress', 'in-progress']],
  ['completed', ['done', 'done']],
  ['canceled', ['canceled', 'canceled']]
]);

const ROW = 'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 py-1';
// A child's list hangs off its root with a left rule
const NEST =
  'ml-1.5 grid gap-0.5 border-l border-[color:var(--line)] pl-3.5 [&[hidden]]:hidden';
const DIM = 'opacity-60';
const TOGGLES: readonly (readonly [keyof TreeFilter, string])[] = [
  ['closed', 'Closed'],
  ['gaps', 'Gaps'],
  ['unqueued', 'Not queued']
];
const UNPRESSED =
  'aria-[pressed=false]:border-[color:var(--line)] aria-[pressed=false]:bg-transparent aria-[pressed=false]:text-[color:var(--muted)]';
// One group: the buttons share their borders and only the ends are rounded
const JOINED =
  'rounded-none first:rounded-l-[var(--r-row)] last:rounded-r-[var(--r-row)] [&:not(:first-child)]:-ml-px focus-visible:relative aria-pressed:relative';

/** A root's sub-issues are open unless the viewer chose otherwise; a finished root starts closed */
const expanded = (
  root: QueueTreeNode,
  open: Readonly<Record<string, boolean>>
): boolean => open[root.ticket] ?? !finishedInFull(root);

/** The collapsed root's summary: how many children, and the worst thing on them */
const Summary = ({ node }: { node: QueueTreeNode }) => {
  const worst = worstChild(node);
  return (
    <>
      <span className={META}>{node.children.length}</span>
      {worst ? <Chip kind={worst.kind}>{worst.text}</Chip> : null}
    </>
  );
};

/** One ticket's row and, under a root, its children */
const Node = ({
  node,
  m,
  details,
  now,
  open,
  onOpen,
  onTicket,
  findings
}: {
  node: QueueTreeNode;
  m: Model;
  details: DeskState['details'];
  now: Date;
  open: Readonly<Record<string, boolean>>;
  onOpen: (ticket: string, open: boolean) => void;
  onTicket: (id: string) => void;
  findings: ReadonlyMap<string, readonly ReviewFinding[]>;
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
  const state = node.state ? STATE.get(node.state) : undefined;
  const isOpen = expanded(node, open);
  const listId = `tree-${node.ticket}`;
  return (
    <li>
      <div className={done ? `${ROW} ${DIM}` : ROW}>
        {node.children.length ? (
          <button
            type="button"
            className="flex min-h-8 min-w-8 flex-none items-center justify-center self-center p-0"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.ticket} sub-issues`}
            onClick={() => onOpen(node.ticket, !isOpen)}
          >
            <Icon
              name="next"
              className={`size-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : null}
        <IdLink id={node.ticket} />
        {node.children.length && !isOpen ? <Summary node={node} /> : null}
        {title ? (
          <TicketButton id={node.ticket} onOpen={onTicket}>
            {title}
          </TicketButton>
        ) : null}
        {node.position !== null ? (
          <span className={`pos ${META}`}>{`#${node.position}`}</span>
        ) : done ? null : node.waiting ? (
          <Chip kind="backlog">waiting</Chip>
        ) : (
          <Chip kind="backlog">not queued</Chip>
        )}
        {state ? (
          <Chip kind={state[1]}>{state[0]}</Chip>
        ) : node.state ? (
          <span className={META}>{node.state}</span>
        ) : null}
        {label ? <Chip kind={label}>{label}</Chip> : null}
        <Prn n={pr} />
        {node.blockers.map((b) => (
          <Chip key={b} kind="blocked">
            blocked by <IdLink id={b} />
          </Chip>
        ))}
        {node.gaps.map((g) => (
          <Chip key={g.kind} kind={g.candidate ? 'held' : 'conflict'}>
            {g.kind}
          </Chip>
        ))}
        {(findings.get(node.ticket) ?? []).map((f) => (
          <FindingChip key={f.id} f={f} />
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
        <ul id={listId} className={NEST} hidden={!isOpen}>
          {node.children.map((c) => (
            <Node
              key={c.ticket}
              node={c}
              m={m}
              details={details}
              now={now}
              open={open}
              onOpen={onOpen}
              onTicket={onTicket}
              findings={findings}
            />
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
  /** The roots the viewer opened or closed by hand */
  open: Readonly<Record<string, boolean>>;
  onOpen: (ticket: string, open: boolean) => void;
  onDesk: () => void;
  /** A row's title opens the Ticket sheet */
  onTicket: (id: string) => void;
  /** The review's open findings by ticket, shown as AI chips on the rows */
  findings?: ReadonlyMap<string, readonly ReviewFinding[]>;
  /** The Review panel, between the header and the filters */
  review?: ReactNode;
};

const NO_FINDINGS: ReadonlyMap<string, readonly ReviewFinding[]> = new Map();

/** The filters' buttons: independent toggles drawn as one group */
const Filters = ({ filter, onFilter }: Pick<Props, 'filter' | 'onFilter'>) => (
  <div className="filters flex flex-wrap" role="group" aria-label="Filter">
    {TOGGLES.map(([key, text]) => (
      <button
        key={key}
        type="button"
        className={`${UNPRESSED} ${JOINED}`}
        data-filter={key}
        aria-pressed={filter[key]}
        onClick={() => onFilter({ ...filter, [key]: !filter[key] })}
      >
        {text}
      </button>
    ))}
  </div>
);

export const TreePage = ({
  m,
  details,
  now,
  filter,
  onFilter,
  open,
  onOpen,
  onDesk,
  onTicket,
  findings = NO_FINDINGS,
  review
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
            the whole backlog in the queue's pick order: state, agent label, PR,
            blockers and gaps
          </span>
        </div>
      </div>
      {review}
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
              open={open}
              onOpen={onOpen}
              onTicket={onTicket}
              findings={findings}
            />
          ))}
        </ul>
      ) : m.tree.length ? (
        <Empty>No ticket matches the filter.</Empty>
      ) : (
        <Empty>No open ticket.</Empty>
      )}
      <p className={RULE}>
        Open tickets with their sub-issues, Done ones for 14 days, in the order
        the queue picks them: #n is the place, &quot;waiting&quot; an agent
        ticket the queue waits on, &quot;not queued&quot; one it would never
        pick. An open blocker shows as a &quot;blocked by&quot; chip, a gap from
        the audit as a chip of its kind, and a grey one is a candidate to check.
        Closed adds the finished roots with no gap, Gaps keeps the roots with a
        gap, Not queued those the queue would never pick.
      </p>
    </>
  );
};
