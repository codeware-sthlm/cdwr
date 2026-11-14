import type { ReactNode } from 'react';

import { waitName } from '../constants';
import { dayTime, seenAgo, tidy, usd } from '../format';
import {
  type TicketQueue,
  type TicketRelative,
  type TicketState,
  type TicketTree,
  ticketState
} from '../view/ticket';
import { mergeBlocker } from '../view/waiting';

import { Chip, Empty, PRIO } from './items';
import { BAR, GROUP, META, RULE } from './items-ui';
import { IdLink, Inline, LinkIds, Prn, TicketButton } from './links';
import type { SheetProps } from './sheets';

// The Ticket sheet: everything the desk holds for one ticket, a section per source

const ROW =
  'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.88rem]';
const LABEL = 'min-w-[5.5em] text-[0.78rem] text-[color:var(--muted)]';

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className={GROUP}>
    <h3>{title}</h3>
    {children}
  </div>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={ROW}>
    <span className={LABEL}>{label}</span>
    {children}
  </div>
);

const Relatives = ({
  label,
  list,
  onTicket
}: {
  label: string;
  list: TicketRelative[];
  onTicket: (id: string) => void;
}) =>
  list.length ? (
    <Row label={`${label} · ${list.length}`}>
      <ul className="grid min-w-0 gap-1">
        {list.map((r) => (
          <li
            key={r.id}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2"
          >
            <IdLink id={r.id} />
            <TicketButton id={r.id} onOpen={onTicket}>
              {r.title || r.id}
            </TicketButton>
            {r.state ? <span className={META}>{r.state}</span> : null}
          </li>
        ))}
      </ul>
    </Row>
  ) : null;

const TreePart = ({
  tree,
  onTicket
}: {
  tree: TicketTree;
  onTicket: (id: string) => void;
}) => (
  <Part title="Tree">
    {tree.parent ? (
      <Relatives label="Parent" list={[tree.parent]} onTicket={onTicket} />
    ) : null}
    <Relatives label="Siblings" list={tree.siblings} onTicket={onTicket} />
    <Relatives label="Children" list={tree.children} onTicket={onTicket} />
    {tree.truncated ? (
      <p className={META}>more sub-issues than the query reads</p>
    ) : null}
  </Part>
);

const QueuePart = ({ queue, now }: { queue: TicketQueue; now: Date }) => (
  <Part title="Queue">
    {queue.waiting ? (
      <Row label="Waits on you">
        <Chip kind="needs-input">{queue.waiting}</Chip>
      </Row>
    ) : null}
    {queue.next ? (
      <Row label="Next">
        <Chip kind="ready">{queue.next.reason ?? 'queued'}</Chip>
        {queue.next.detail ? <Inline text={queue.next.detail} /> : null}
      </Row>
    ) : null}
    {queue.parked ? (
      <Row label="Parked">
        <Chip kind="parked">
          {waitName(queue.parked.wait) || queue.parked.wait || 'wait'}
        </Chip>
        {queue.parked.since ? (
          <span className={META}>since {seenAgo(queue.parked.since, now)}</span>
        ) : null}
        {queue.parked.resolved ? (
          <span className={META}>
            resolved{queue.parked.outcome ? `: ${queue.parked.outcome}` : ''}
          </span>
        ) : null}
      </Row>
    ) : null}
    {queue.held ? (
      <Row label="Limit">
        <span>Holds one of the limit&apos;s slots</span>
      </Row>
    ) : null}
    {queue.blockedBy.length ? (
      <Row label="Blocked by">
        {queue.blockedBy.map((b) => (
          <IdLink key={b} id={b} />
        ))}
      </Row>
    ) : null}
    {queue.toLabel ? (
      <Row label="To label">
        <span>
          Waits for <code>agent:ready</code>
          {queue.toLabel.parent ? (
            <>
              {' '}
              under <IdLink id={queue.toLabel.parent} />
            </>
          ) : null}
        </span>
      </Row>
    ) : null}
    {queue.review ? (
      <Row label="Review">
        <span>Its PR waits for review</span>
        <Prn n={queue.review.pr} />
      </Row>
    ) : null}
    {queue.handoffs.length ? (
      <Row label="Hand-offs">
        <ul className="grid min-w-0 gap-1">
          {queue.handoffs.map((h, n) => (
            <li key={n}>
              <Inline text={h} />
            </li>
          ))}
        </ul>
      </Row>
    ) : null}
  </Part>
);

const PrPart = ({ pr }: { pr: NonNullable<TicketState['pr']> }) => {
  const { entry } = pr;
  const blocker = mergeBlocker(entry);
  return (
    <Part title="PR">
      <Row label="Pull request">
        <Prn n={entry.pr} />
        <span className={META}>{entry.state}</span>
      </Row>
      <Row label="CI">{entry.ci ? entry.ci.toLowerCase() : 'no data yet'}</Row>
      <Row label="Threads">
        {`${entry.threads ?? entry.unresolved} unresolved`}
      </Row>
      <Row label="Copilot">{entry.copilot ?? 'unknown'}</Row>
      <Row label="Mergeable">
        <Chip kind={blocker === null ? 'ready' : 'review'}>
          {blocker ?? 'mergeable'}
        </Chip>
      </Row>
    </Part>
  );
};

/** The body of the Ticket sheet */
export const TicketBody = ({ m, state, now, actions }: SheetProps) => {
  const id = state.ui.ticket;
  if (id === null) return <Empty>No ticket chosen.</Empty>;
  const t = ticketState(m, state, id);
  if (!t.known)
    return (
      <>
        <Row label="Linear">
          <IdLink id={id} />
        </Row>
        <Empty>The desk holds nothing more for this ticket.</Empty>
      </>
    );
  const {
    linear,
    queue,
    tree,
    pr,
    gaps,
    candidates,
    session,
    plan,
    snooze,
    spend
  } = t;
  return (
    <>
      {linear ? (
        <Part title="Linear">
          <Row label="Status">
            <span>{linear.status.name}</span>
            <IdLink id={id} />
          </Row>
          {linear.labels.length ? (
            <Row label="Labels">
              {linear.labels.map((l) => {
                const name = l.replace(/^agent:/, '');
                return (
                  <Chip key={l} kind={name}>
                    {name}
                  </Chip>
                );
              })}
            </Row>
          ) : null}
          <Row label="Priority">{PRIO.get(linear.priority) ?? 'None'}</Row>
          <Row label="Updated">{seenAgo(linear.updatedAt, now)}</Row>
        </Part>
      ) : null}
      {queue ? <QueuePart queue={queue} now={now} /> : null}
      {tree ? <TreePart tree={tree} onTicket={actions.onTicket} /> : null}
      {pr ? <PrPart pr={pr} /> : null}
      {gaps ? (
        <Part title="Gaps">
          {gaps.map((g) => (
            <Row key={g.id} label={g.kind}>
              <span>{`${g.what}. ${g.fix}.`}</span>
            </Row>
          ))}
        </Part>
      ) : null}
      {candidates ? (
        <Part title="Candidates to check">
          {candidates.map((g) => (
            <Row key={g.id} label={g.kind}>
              <span>{`${g.what}. ${g.fix}.`}</span>
            </Row>
          ))}
        </Part>
      ) : null}
      {session ? (
        <Part title="Session">
          <Row label="State">
            <Chip
              kind={session.state === 'waiting' ? 'needs-input' : 'working'}
            >
              {session.state}
            </Chip>
            {session.detail ? <span>{session.detail}</span> : null}
          </Row>
          {session.host || session.kind ? (
            <Row label="Where">
              {[session.host, session.kind].filter(Boolean).join(' · ')}
            </Row>
          ) : null}
          {session.lastSeen ? (
            <Row label="Heartbeat">{seenAgo(session.lastSeen, now)}</Row>
          ) : null}
        </Part>
      ) : null}
      {plan ? (
        <Part title="Plan">
          <Row label="Steps">
            <div className={`${BAR} w-[120px]`} aria-hidden="true">
              <i
                style={{
                  width: `${Math.round((plan.done / plan.steps) * 100)}%`
                }}
              ></i>
            </div>
            <span>{`${plan.done}/${plan.steps} done`}</span>
          </Row>
          {plan.next ? (
            <Row label="Next">
              <span>
                <LinkIds text={tidy(plan.next)} />
              </span>
            </Row>
          ) : null}
        </Part>
      ) : null}
      {snooze ? (
        <Part title="Snooze">
          <Row label="Snoozed">
            <span>{`on ${snooze.kind}, ${seenAgo(snooze.at, now)}, by ${snooze.actor}`}</span>
          </Row>
        </Part>
      ) : null}
      {spend ? (
        <Part title="Spend">
          <Row label="Total">
            <b>{usd(spend.total, 2)}</b>
            <span className={META}>
              {`planning ${usd(spend.planning, 2)} · orchestrating ${usd(spend.orchestrating, 2)} · implementing ${usd(spend.implementing, 2)}`}
            </span>
          </Row>
        </Part>
      ) : null}
      {t.activity ? (
        <Part title="Activity">
          <ul className="grid gap-1">
            {t.activity.map((e, n) => (
              <li key={n} className={ROW}>
                <time className={META}>{dayTime(e.at, now.getTime())}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      <p className={RULE}>
        What the desk holds for this ticket, from Linear, the scheduler&apos;s
        queue view, GitHub and the usage records.
      </p>
    </>
  );
};
