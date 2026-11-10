import { planWhen, shortAge, tidy } from '../format';
import type { Model, PlanWindow } from '../model';
import { livePr, parkedPlain, prTone, queuePr } from '../render/html';
import { ofKind } from '../render/problems';
import {
  type Part,
  alsoText,
  feedTone,
  headline,
  idPr,
  status,
  whereText
} from '../render/session';
import type { Detail } from '../state';
import type { SessionState } from '../types';

import { IdLink, LinkIds, PrLink, PrPill, Prn } from './links';

// The session card: what the session does, where it runs, and the newest live events

/** A headline's parts: text, ticket ids, PRs and code */
export const Parts = ({ parts }: { parts: Part[] }) => (
  <>
    {parts.map((p, i) =>
      typeof p === 'string' ? (
        p
      ) : 'id' in p ? (
        <IdLink key={i} id={p.id} />
      ) : 'prn' in p ? (
        <Prn key={i} n={p.prn} tone={p.tone} />
      ) : 'pr' in p ? (
        <PrLink key={i} n={p.pr} />
      ) : (
        <code key={i}>{p.code}</code>
      )
    )}
  </>
);

/** "Step 3 of 5" with a bar and the next step, for the working ticket; nothing without a plan */
const StepLine = ({ d }: { d: Detail | undefined }) =>
  d && d.steps ? (
    <div className="ct-step">
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.round((d.done / d.steps) * 100)}%` }}></i>
      </div>
      <span>
        Step {Math.min(d.done + 1, d.steps)} of {d.steps}
      </span>
      {d.next ? (
        <span className="ct-next">
          <LinkIds text={tidy(d.next)} />
        </span>
      ) : null}
    </div>
  ) : null;

/** What the working ticket is parked on, and for how long; nothing when it is not parked */
const WaitLine = ({
  m,
  ticket,
  now
}: {
  m: Model;
  ticket: string;
  now: Date;
}) => {
  const p = m.parked.find((x) => x.ticket === ticket) ?? m.prWaits.get(ticket);
  if (!p) return null;
  const age =
    p.since && !p.resolved
      ? ` for ${shortAge((now.getTime() - Date.parse(p.since)) / 6e4)}`
      : '';
  return (
    <div className="ct-wait">
      {parkedPlain(p)}
      {p.pr ? (
        <>
          {' on '}
          <PrLink n={p.pr} />
        </>
      ) : null}
      {age}
    </div>
  );
};

/** The working ticket's own PR as the feed's first row; nothing without a PR */
const OwnPrRow = ({
  m,
  details,
  ticket,
  now
}: {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  ticket: string;
  now: Date;
}) => {
  const x = { ticket, pr: queuePr(m, ticket) };
  const { n, live } = livePr(m, details, x);
  if (!n) return null;
  return (
    <li className="own">
      <Prn n={n} tone={prTone(live?.state ?? null)} />{' '}
      <PrPill m={m} details={details} x={x} now={now} />
    </li>
  );
};

/** "Plan: 5h 30% · resets 14:00 · 7d 18%", a window over its pace marked bad, an old sample dimmed; nothing without a live window */
const PlanLine = ({ m, now }: { m: Model; now: Date }) => {
  type Live = Exclude<PlanWindow, { reset: true }>;
  const live = (w: PlanWindow | null): Live | null =>
    w && !w.reset ? w : null;
  const five = live(m.plan.five_hour);
  const seven = live(m.plan.seven_day);
  if (!five && !seven) return null;
  const pct = (w: Live) => (
    <span className={w.verdict === 'ok' ? '' : 'bad'}>
      {Math.round(w.used)}%
    </span>
  );
  const stale = [five, seven].some((w) => w?.stale);
  return (
    <div className={`ct-plan${stale ? 'stale' : ''}`}>
      Plan:{' '}
      {five ? (
        <>
          5h {pct(five)} · resets {planWhen(five.resetsAt, now)}
        </>
      ) : null}
      {five && seven ? ' · ' : null}
      {seven ? <>7d {pct(seven)}</> : null}
    </div>
  );
};

type Props = {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  now: Date;
};

/** The session card */
export const SessionCard = ({ m, details, now }: Props) => {
  const s: SessionState = m.session ?? { state: 'none' };
  const st = status(m);
  const h = headline(m, details, now);
  const where = s.state === 'none' ? '' : whereText(m);
  const seen =
    s.lastSeen && s.state !== 'none'
      ? `seen ${shortAge((now.getTime() - Date.parse(s.lastSeen)) / 6e4)} ago`
      : '';
  const working = s.ticket && (s.state === 'alive' || s.state === 'waiting');
  const reason = working
    ? m.next.find((x) => x.ticket === s.ticket)?.reason
    : undefined;
  const ticket = working ? (s.ticket ?? '') : '';
  const sub = working
    ? [reason, m.get(ticket).title].filter(Boolean).join(' · ')
    : null;
  const then = ticket ? m.next.find((x) => x.ticket !== ticket) : undefined;
  // "also" adds to the session the head names; with none named it has nothing to add to
  const also = where ? alsoText(m) : '';
  const feed = m.feed.slice(0, 2);
  const hasOwn =
    ticket && livePr(m, details, { ticket, pr: queuePr(m, ticket) }).n;
  return (
    <article className={`card-top session ${st.tone}`} data-w="session">
      <div className="ct-head">
        <button type="button" className="open state" aria-haspopup="dialog">
          <i className="dot" aria-hidden="true"></i>
          {st.label}
        </button>
        {where || seen ? (
          <span className="who-runs">
            {where ? (
              <b className={where.startsWith('attended') ? 'attended' : ''}>
                {where}
              </b>
            ) : null}
            {where && seen ? ' · ' : null}
            {seen}
          </span>
        ) : null}
      </div>
      <div className="big">
        {working ? (
          <>
            Working on{' '}
            <span className="mono">
              <Parts parts={idPr(m, details, ticket)} />
            </span>
          </>
        ) : (
          <Parts parts={h.text} />
        )}
      </div>
      {working ? (
        sub ? (
          <p className="ct-sub">{sub}</p>
        ) : null
      ) : h.note.length ? (
        <p className="ct-sub">
          <Parts parts={h.note} />
        </p>
      ) : null}
      {ticket ? (
        <>
          <StepLine d={details.get(ticket)} />
          <WaitLine m={m} ticket={ticket} now={now} />
        </>
      ) : null}
      <h4 className="feed-h">Latest events</h4>
      <ul className="feed">
        {ticket ? (
          <OwnPrRow m={m} details={details} ticket={ticket} now={now} />
        ) : null}
        {feed.map((p, i) => (
          <li key={i}>
            <i className={`dot ${feedTone(p)}`.trim()} aria-hidden="true"></i>
            <span className="what">
              <LinkIds text={p.subject} /> · {p.what}
            </span>
            <time>{shortAge((now.getTime() - p.at) / 6e4)} ago</time>
          </li>
        ))}
        {!hasOwn && !feed.length ? (
          <li className="none">No live event yet</li>
        ) : null}
      </ul>
      {then ? (
        <div className="ct-then">
          Then: <IdLink id={then.ticket} /> ({then.reason})
        </div>
      ) : null}
      <PlanLine m={m} now={now} />
      {also ? <div className="ct-also">{also}</div> : null}
    </article>
  );
};

/** The dashed, striped card that stands in for the session's while its state is unknown; nothing otherwise */
export const UnknownSession = ({ m }: { m: Model }) => {
  const p = ofKind(m.problems, 'unknown')[0];
  if (!p) return null;
  const ticket = p.ticket ? (
    <span className="mono">
      <IdLink id={p.ticket} />
    </span>
  ) : null;
  return (
    <section className="state-unknown" aria-label="Session state unknown">
      <span className="p-pill solid">STATE UNKNOWN</span>
      <div className="su-text">
        <b className="su-title">
          Last known: {p.host}{' '}
          {ticket ? (
            <>
              <span className="long">running {ticket}</span>
              <span className="short">on {ticket}</span>
            </>
          ) : (
            'with a session open'
          )}
        </b>
        <span className="su-sub wide">
          Shown greyed until a heartbeat or a fresh snapshot confirms it.
          Nothing here is assumed to be running.
        </span>
      </div>
    </section>
  );
};
