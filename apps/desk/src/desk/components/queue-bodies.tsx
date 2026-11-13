import { Fragment, type ReactNode } from 'react';

import { GH_PR, LIMIT, waitName } from '../constants';
import { hhmm } from '../format';
import { type Model, type TicketRef, prOf } from '../model';
import type { DeskState, Detail } from '../state';
import type { QueueNext, QueueRenovate, SessionState } from '../types';
import { parkedPlain, prWaitPlain } from '../view/parked';
import { livePr } from '../view/pr';

import { Chip, Empty, Item, LoadMeter, ReasonChip } from './items';
import {
  CHECKS,
  CHECK_LI,
  GROUP,
  HO,
  ID,
  MAIN,
  META,
  RANK,
  RULE,
  SIDE,
  TITLE,
  itemClass
} from './items-ui';
import { IdLink, Inline, PrPill, Prn } from './links';
import { KNOBS, PV_STATS } from './sheet-ui';

// The queue sheets: what the agent takes next, the open PRs, the hand-offs left and the limit

// A pull request's card on the Review sheet: its ids sit small, its title and meta line run flat
const PR_ROW =
  'pr-row flex min-w-0 flex-col gap-2.5 rounded-[var(--r-tile)] border border-[color:var(--line-strong)] bg-[color:var(--raised)] px-4 py-3.5 [&_.id]:mr-0 [&_.id]:shrink-0 [&_.id]:text-[11px]';
// A card held back by an open blocker has a reddish frame
const PR_ROW_BLOCKED =
  'pr-row blocked flex min-w-0 flex-col gap-2.5 rounded-[var(--r-tile)] border border-[color:color-mix(in_srgb,var(--block)_40%,var(--line-strong))] bg-[color:var(--raised)] px-4 py-3.5 [&_.id]:mr-0 [&_.id]:shrink-0 [&_.id]:text-[11px]';
const PR_RANK =
  'rank min-w-[1.4em] shrink-0 font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)] tabular-nums';
const PR_TITLE =
  'title min-w-0 overflow-hidden text-[13px] font-normal text-ellipsis whitespace-nowrap text-[color:var(--fg)] [overflow-wrap:anywhere] hover:underline';
const PR_META =
  'meta flex flex-wrap items-center gap-2.5 text-[0.78rem] text-[color:var(--muted)] [&_time]:ml-auto [&_time]:font-[family-name:var(--font-mono)] [&_time]:text-[11px] [&_time]:leading-[normal] [&_time]:font-normal';

type BodyProps = { m: Model; state: DeskState; now: Date };

const WHY: ReadonlyMap<string, string> = new Map([
  ['answered', 'Your reply is in.'],
  ['review feedback', 'Its PR has review comments to address.'],
  ['conflicts with main', 'Its PR conflicts with main and needs a rebase.'],
  ['merged comment', 'A comment on its merged ticket waits for a suggestion.'],
  ['renovate', 'This Renovate PR needs a hand.'],
  ['take over', 'Its claim went stale, or it never had one.'],
  ['resume', ''],
  ['ready', '']
]);

const nextAt = (m: Pick<Model, 'nextRun'>): string =>
  m.nextRun ? hhmm(m.nextRun) : 'its next run';

/** "merge #617 (COD-566) first", or a blocker without a PR yet; nothing when nothing holds the PR back */
export const blockedText = (
  m: Pick<Model, 'prBlockers'>,
  id: string
): ReactNode[] =>
  (m.prBlockers.get(id) || []).map((b, n) => (
    <Fragment key={b.ticket}>
      {n ? '; ' : null}
      {b.pr ? (
        <>
          merge <Prn n={b.pr} /> (<IdLink id={b.ticket} />) first
        </>
      ) : (
        <>
          <IdLink id={b.ticket} /> has no PR yet
        </>
      )}
    </Fragment>
  ));

/** Who takes a queued item and when: the live session, or the scheduler on its next run */
export const whyLine = (m: Model, x: QueueNext): ReactNode => {
  const s: SessionState = m.session ?? { state: 'none' };
  const live = s.state === 'alive' || s.state === 'waiting';
  const who =
    m.stuck !== null
      ? 'The live session should have taken it; it is stuck polling.'
      : live
        ? s.ticket === x.ticket
          ? 'The live session is on it.'
          : 'The live session takes it after its current step.'
        : x.reason === 'ready'
          ? `The scheduler plans it at ${nextAt(m)}.`
          : x.reason === 'renovate' && x.detail === 'conflicting'
            ? 'The scheduler leaves a Renovate conflict to an attended session: start one.'
            : `The scheduler starts a session for it at ${nextAt(m)}.`;
  const lead = (x.reason !== undefined && WHY.get(x.reason)) || '';
  return (
    <>
      {[lead, who].filter(Boolean).join(' ')}
      {x.detail ? (
        <>
          {' '}
          <Inline text={x.detail} />
        </>
      ) : null}
    </>
  );
};

/** The row class for why a ticket is queued */
const reasonState = (x: QueueNext): string =>
  x.reason === 'ready'
    ? 'ready'
    : x.reason === 'answered'
      ? 'answered'
      : x.reason === 'review feedback' ||
          x.reason === 'conflicts with main' ||
          x.reason === 'merged comment'
        ? 'review'
        : 'working';

/** What would free a slot under the limit */
const Free = ({ m }: { m: Model }) =>
  m.held.free.length ? (
    <ul className={KNOBS}>
      {m.held.free.map((f, n) => (
        <li key={n}>
          {f.action === 'review' ? (
            <>
              <b>Review {f.pr ? '#' + f.pr : <IdLink id={f.ticket} />}</b>
              <span>
                Merging or closing <IdLink id={f.ticket} /> frees a slot
              </span>
            </>
          ) : f.action === 'wait' ? (
            <>
              <b>
                <IdLink id={f.ticket} /> waits on {f.pr ? '#' + f.pr : 'its PR'}
              </b>
              <span>Its slot frees when that PR merges or closes</span>
            </>
          ) : (
            <>
              <b>
                Run with <code>limit={f.value}</code>
              </b>
              <span>Raises the limit for that session only</span>
            </>
          )}
        </li>
      ))}
    </ul>
  ) : null;

/** One Renovate PR: its number and title link to GitHub, and the ticket tending it to Linear */
const RenovateItem = ({ r }: { r: QueueRenovate }) => (
  <li className={itemClass('working')}>
    <span className={RANK}></span>
    <div className={MAIN}>
      <a
        className={TITLE}
        href={GH_PR + r.pr}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={ID}>#{r.pr}</span>
        {r.title}
      </a>
      <div className={META}>
        {r.state === 'tended' && r.ticket ? (
          <>
            Tended by <IdLink id={r.ticket} />
          </>
        ) : r.state === 'conflicting' ? (
          'Conflicts with main'
        ) : (
          'Checks failed'
        )}
      </div>
    </div>
    <span className={SIDE}>
      <Chip kind={r.state === 'tended' ? 'resume' : 'conflict'}>{r.state}</Chip>
    </span>
  </li>
);

export const NextBody = ({ m, state }: BodyProps) => {
  if (!m.v) return <Empty>No queue view yet.</Empty>;
  const { details } = state;
  return (
    <>
      <div className={GROUP}>
        <h3>{`Next · ${m.next.length}`}</h3>
        {m.next.length ? (
          <ol>
            {m.next.map((x, n) => (
              <Item
                key={x.ticket}
                details={details}
                i={m.get(x.ticket)}
                state={reasonState(x)}
                rank={n + 1}
                side={
                  <>
                    <Prn n={prOf(details, x.ticket)} />{' '}
                    <ReasonChip reason={x.reason} />
                  </>
                }
                note={whyLine(m, x)}
              />
            ))}
          </ol>
        ) : (
          <Empty>
            Nothing to take. In Linear, add <code>agent:ready</code> to a ticket
            as the last step of refining it.
          </Empty>
        )}
      </div>
      {m.parked.length ? (
        <div className={GROUP}>
          <h3>{`Parked on a wait · ${m.parked.length}`}</h3>
          <ul>
            {m.parked.map((p) => (
              <Item
                key={p.ticket}
                details={details}
                i={m.get(p.ticket)}
                state="working"
                side={
                  <>
                    <Prn n={prOf(details, p.ticket, p.pr)} />{' '}
                    <Chip kind="parked">{waitName(p.wait) || p.wait}</Chip>
                  </>
                }
                note={`${parkedPlain(p)}${p.pr ? ' for #' + p.pr : ''}, since ${p.since ? hhmm(Date.parse(p.since)) : '?'}. It resumes when that finishes.`}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {m.renovate.length ? (
        <div className={GROUP}>
          <h3>{`Renovate PRs · ${m.renovate.length}`}</h3>
          <ul>
            {m.renovate.map((r) => (
              <RenovateItem key={r.pr} r={r} />
            ))}
          </ul>
        </div>
      ) : null}
      {m.gaps.length ? (
        <div className={GROUP}>
          <h3>{`Gaps · ${m.gaps.length}`}</h3>
          <ul>
            {m.gaps.map((g) => (
              <Item
                key={g.id}
                details={details}
                i={m.get(g.ticket)}
                state="plain"
                side={<Chip kind="conflict">{g.kind}</Chip>}
                note={`${g.what}. ${g.fix}.`}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {m.held.tickets.length ? (
        <div className={GROUP}>
          <h3>{`Held by the limit · ${m.held.tickets.length}`}</h3>
          <ul>
            {m.held.tickets.map((id) => (
              <Item
                key={id}
                details={details}
                i={m.get(id)}
                state="plain"
                side={<Chip kind="held">held</Chip>}
              />
            ))}
          </ul>
          <Free m={m} />
        </div>
      ) : null}
      <p className={RULE}>
        A session resumes its own work first, then takes over stale claims,
        answered tickets and review feedback, then rebases a review PR that
        conflicts with main, then answers comments on merged tickets, then takes
        new <code>agent:ready</code> tickets while the limit has room. A ticket
        parked on CI or a Copilot review resumes when the wait resolves. With no
        session alive, the scheduler starts one for anything but a new ready
        ticket, which it plans itself.
      </p>
    </>
  );
};

/** One card per open PR in merge order, its state and age from the newest github event */
export const ReviewBody = ({ m, state, now }: BodyProps) => {
  if (!m.v) return <Empty>No queue view yet.</Empty>;
  const { details } = state;
  return (
    <>
      {m.prs.length ? (
        <ul className="flex flex-col gap-3">
          {m.prs.map((x, rank) => {
            const { n } = livePr(m, details, x);
            const blocked = blockedText(m, x.ticket);
            const wait = prWaitPlain(m, x.ticket);
            const i = m.get(x.ticket);
            return (
              <li
                key={x.ticket}
                className={blocked.length ? PR_ROW_BLOCKED : PR_ROW}
                data-pr={n ?? ''}
              >
                <div className="flex min-w-0 items-baseline gap-2.5">
                  {m.prs.length > 1 ? (
                    <span className={PR_RANK}>{rank + 1}</span>
                  ) : null}
                  <span className="prnum font-[family-name:var(--font-mono)] text-[13px] leading-[normal] font-semibold">
                    <Prn n={n} />
                  </span>
                  <IdLink id={x.ticket} />
                  <a
                    className={PR_TITLE}
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {i.title}
                  </a>
                </div>
                <div className={PR_META}>
                  <PrPill m={m} details={details} x={x} now={now}>
                    {blocked.length ? (
                      <Chip kind="blocked">merge later</Chip>
                    ) : null}
                  </PrPill>
                </div>
                {blocked.length || wait ? (
                  <div className={PR_META}>
                    {blocked.length ? <>Merge order: {blocked}</> : null}
                    {blocked.length && wait ? '. ' : null}
                    {wait}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>No open agent PR.</Empty>
      )}
      <p className={RULE}>
        Rows update in place as github_events lands — parked Copilot and CI
        waits resolve here, not at the next scheduler snapshot.
      </p>
    </>
  );
};

const HandoffCard = ({
  m,
  details,
  x
}: {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  x: { ticket: string; items?: string[] };
}) => {
  const i: TicketRef = m.get(x.ticket);
  const when = i.completedAt
    ? 'closed ' +
      new Date(i.completedAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      })
    : i.status;
  const pr = prOf(details, x.ticket);
  return (
    <article className={HO}>
      <a
        className={TITLE}
        href={i.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={ID}>{i.id}</span>
        {i.title}
      </a>
      <div className={META}>
        {when}
        {pr ? (
          <>
            {' · '}
            <Prn n={pr} />
          </>
        ) : null}
      </div>
      <ul className={CHECKS}>
        {(x.items || []).map((t, n) => (
          <li key={n} className={CHECK_LI}>
            <span>
              <Inline text={t} />
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
};

export const HandoffsBody = ({ m, state }: BodyProps) => {
  if (!m.v) return <Empty>No queue view yet.</Empty>;
  const { details } = state;
  return (
    <>
      {m.handoffs.length ? (
        <div className={GROUP}>
          <h3>{`Merged, hand-offs left · ${m.handoffItems}`}</h3>
          {m.handoffs.map((x) => (
            <HandoffCard key={x.ticket} m={m} details={details} x={x} />
          ))}
        </div>
      ) : (
        <Empty>No hand-off left.</Empty>
      )}
      <p className={RULE}>
        Hand-offs come from agent tickets merged in the last 14 days. They
        don&apos;t count toward the limit. The heading must read exactly{' '}
        <code>Hand-off checklist:</code>.
      </p>
    </>
  );
};

export const LimitBody = ({ m, state }: BodyProps) => {
  const { details } = state;
  const max = m.limit.max || LIMIT;
  return (
    <>
      <div className={PV_STATS}>
        <div>
          <b>{`${m.limit.used} of ${max}`}</b>
          <span>agent PRs in flight</span>
        </div>
        <div>
          <b>{m.held.tickets.length}</b>
          <span>ready tickets held</span>
        </div>
      </div>
      <LoadMeter m={m} />
      <div className={GROUP}>
        <h3>{`Holding a slot · ${m.slots.length}`}</h3>
        {m.slots.length ? (
          <ul>
            {m.slots.map((x) => (
              <Item
                key={x.ticket}
                details={details}
                i={m.get(x.ticket)}
                state="review"
                side={<Prn n={prOf(details, x.ticket, x.pr)} />}
                note={x.why}
              />
            ))}
          </ul>
        ) : (
          <Empty>None.</Empty>
        )}
      </div>
      {m.held.tickets.length ? (
        <div className={GROUP}>
          <h3>{`Held · ${m.held.tickets.length}`}</h3>
          <ul>
            {m.held.tickets.map((id) => (
              <Item key={id} details={details} i={m.get(id)} state="plain" />
            ))}
          </ul>
          <Free m={m} />
        </div>
      ) : null}
      <p className={RULE}>
        Each open <code>agent:review</code> PR counts one, and so does a ticket
        parked on its PR&apos;s CI or Copilot review, since its PR is already
        open. Hand-offs don&apos;t count. At {max}, <code>/work-queue</code>{' '}
        stops starting new tickets but still resumes your answers, reviews and
        parked work. A session&apos;s <code>limit=N</code> isn&apos;t visible
        here, so the queue view&apos;s limit applies.
      </p>
    </>
  );
};
