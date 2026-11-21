import type { MouseEventHandler } from 'react';

import { planWhen, shortAge, tidy } from '../format';
import { type Pulse, ofKind } from '../live';
import type { Model, PlanWindow } from '../model';
import type { Detail } from '../state';
import type { SessionState } from '../types';
import { parkedPlain } from '../view/parked';
import { livePr, prTone, queuePr } from '../view/pr';
import { type Part, headline, idPr, whereText } from '../view/session';

import { CARD, HEAD, NONE, OPEN, TIME } from './card-ui';
import { BAR } from './items-ui';
import { IdLink, LinkIds, PrLink, PrPill, Prn } from './links';

// The session card: what the session does, where it runs, and the newest live events

type Status = {
  label: string;
  tone: 'live' | 'wait' | 'block' | 'idle';
};

/** The session pill's label and tone */
const status = (m: Model): Status => {
  const s = m.session?.state ?? 'none';
  if (m.stuck !== null) return { label: 'Session stuck', tone: 'block' };
  if (s === 'alive') return { label: 'Session live', tone: 'live' };
  if (s === 'waiting') return { label: 'Waiting on a prompt', tone: 'wait' };
  if (s === 'stopped') return { label: 'Session stopped', tone: 'idle' };
  return { label: 'No session', tone: 'idle' };
};

/** A feed row's dot: green for a good outcome, red for a failed one, else neutral */
const feedTone = (p: Pulse): string =>
  /failed|closed/.test(p.what)
    ? 'block'
    : /passed|merged|reviewed/.test(p.what)
      ? 'live'
      : '';

/** The utilities behind each tone: the pill's colour, its dot, and a feed row's dot */
const OPEN_TONE: Record<Status['tone'], string> = {
  live: 'text-[color:var(--live)]',
  wait: 'text-[color:var(--wait)]',
  block: 'text-[color:var(--block)]',
  idle: 'text-[color:var(--muted)]'
};
const PILL_DOT_TONE: Record<Status['tone'], string> = {
  live: 'bg-[color:var(--live)] motion-safe:animate-[beat_2s_ease-in-out_infinite]',
  wait: 'bg-[color:var(--wait)]',
  block: 'bg-[color:var(--block)]',
  idle: 'bg-[color:var(--faint)]'
};
const FEED_DOT_TONE: Record<string, string> = {
  live: 'bg-[color:var(--live)]',
  block: 'bg-[color:var(--block)]',
  '': 'bg-[color:var(--faint)]'
};

/** The mono line under the headline: the plan step, what it waits on, what is next, the plan window, the other sessions */
const CT_LINE =
  'font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
/** A ticket link inside a line that takes the line's colour */
const ID_INHERIT = '[&_a.id]:text-inherit';
/** The sub line under the headline */
const CT_SUB =
  'ct-sub overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-[color:var(--muted)] max-[600px]:text-[12px] [&_a.id]:text-inherit [&_a.id]:no-underline [&_a.id:hover]:underline';
/** A feed row; one row on a phone */
const FEED_LI =
  'flex min-w-0 items-center gap-2.5 max-[600px]:nth-[n+2]:hidden';
const FEED_MONO =
  'font-[family-name:var(--font-mono)] text-[12px] leading-[normal] font-normal';
/** A circle before a line: the pill's, then a feed row's at six pixels */
const DOT = 'dot flex-none rounded-[var(--r-pill)]';

/** "also: implement on agent-host · attended on mac", the live sessions besides the one the card names, at most two */
const alsoText = (m: Pick<Model, 'session' | 'hostSessions'>): string => {
  const all = m.hostSessions.flatMap((h) =>
    h.sessions.map((x) => ({ id: x.id, text: `${x.kind} on ${h.host}` }))
  );
  const id = m.session?.id;
  const picked = (id && all.find((x) => x.id === id)) || all[0];
  const rest = all.filter((x) => x !== picked).map((x) => x.text);
  if (!rest.length) return '';
  return `also: ${rest.slice(0, 2).join(' · ')}${rest.length > 2 ? ` +${rest.length - 2} more` : ''}`;
};

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
    <div className={`ct-step ${CT_LINE} flex min-w-0 items-center gap-2`}>
      <div className={`${BAR} w-[60px] flex-none`} aria-hidden="true">
        <i style={{ width: `${Math.round((d.done / d.steps) * 100)}%` }}></i>
      </div>
      <span className="flex-none">
        Step {Math.min(d.done + 1, d.steps)} of {d.steps}
      </span>
      {d.next ? (
        <span className="ct-next min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap">
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
    <div className={`ct-wait ${CT_LINE} ${ID_INHERIT}`}>
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
    <li className={`own ${FEED_LI} ${FEED_MONO}`}>
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
    <span className={w.verdict === 'ok' ? '' : 'bad text-[color:var(--block)]'}>
      {Math.round(w.used)}%
    </span>
  );
  const stale = [five, seven].some((w) => w?.stale);
  return (
    <div className={stale ? `ct-plan stale ${CT_LINE}` : `ct-plan ${CT_LINE}`}>
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
  /** A click on the card, which opens its sheet */
  onClick?: MouseEventHandler<HTMLElement>;
};

/** The session card */
export const SessionCard = ({ m, details, now, onClick }: Props) => {
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
    <article
      className={`${CARD} session ${st.tone} flex-[2_1_420px] border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--line-strong)]`}
      data-w="session"
      onClick={onClick}
    >
      <div className={HEAD}>
        <button
          type="button"
          className={`${OPEN} ${OPEN_TONE[st.tone]}`}
          aria-haspopup="dialog"
        >
          <i
            className={`${DOT} h-2 w-2 ${PILL_DOT_TONE[st.tone]}`}
            aria-hidden="true"
          ></i>
          {st.label}
        </button>
        {where || seen ? (
          <span className="who-runs overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-[color:var(--muted)]">
            {where ? (
              <b
                className={
                  where.startsWith('attended')
                    ? 'attended font-medium text-[color:var(--attended)]'
                    : 'font-medium text-[color:var(--fg)]'
                }
              >
                {where}
              </b>
            ) : null}
            {where && seen ? ' · ' : null}
            {seen}
          </span>
        ) : null}
      </div>
      <div className="big text-[26px] leading-[1.2] font-bold text-pretty [overflow-wrap:anywhere] max-[600px]:text-[18px] max-[600px]:leading-[1.25] [&_a.id]:text-inherit [&_a.id]:no-underline [&_a.id:hover]:underline">
        {working ? (
          <>
            Working on{' '}
            <span className="mono font-[family-name:var(--font-mono)] font-semibold [&_a.id]:font-[family-name:var(--font-mono)] [&_a.id]:font-semibold">
              <Parts parts={idPr(m, details, ticket)} />
            </span>
          </>
        ) : (
          <Parts parts={h.text} />
        )}
      </div>
      {working ? (
        sub ? (
          <p className={CT_SUB}>{sub}</p>
        ) : null
      ) : h.note.length ? (
        <p className={CT_SUB}>
          <Parts parts={h.note} />
        </p>
      ) : null}
      {ticket ? (
        <>
          <StepLine d={details.get(ticket)} />
          <WaitLine m={m} ticket={ticket} now={now} />
        </>
      ) : null}
      <h4 className="feed-h text-[0.7rem] font-semibold tracking-[0.08em] text-[color:var(--muted)] uppercase max-[600px]:hidden">
        Latest events
      </h4>
      <ul className="feed flex flex-col gap-2 max-[600px]:border-t max-[600px]:border-[color:var(--line)] max-[600px]:pt-2">
        {ticket ? (
          <OwnPrRow m={m} details={details} ticket={ticket} now={now} />
        ) : null}
        {feed.map((p, i) => (
          <li key={i} className={`${FEED_LI} ${FEED_MONO}`}>
            <i
              className={`${DOT} ${feedTone(p)} h-1.5 w-1.5 ${FEED_DOT_TONE[feedTone(p)]}`}
              aria-hidden="true"
            ></i>
            <span className="what overflow-hidden text-ellipsis whitespace-nowrap">
              <LinkIds text={p.subject} /> · {p.what}
            </span>
            <time className={`ml-auto ${TIME}`}>
              {shortAge((now.getTime() - p.at) / 6e4)} ago
            </time>
          </li>
        ))}
        {!hasOwn && !feed.length ? (
          <li className={`none ${FEED_LI} ${NONE}`}>No live event yet</li>
        ) : null}
      </ul>
      {then ? (
        <div className={`ct-then ${CT_LINE} ${ID_INHERIT} max-[600px]:hidden`}>
          Then: <IdLink id={then.ticket} /> ({then.reason})
        </div>
      ) : null}
      <PlanLine m={m} now={now} />
      {also ? (
        <div className={`ct-also ${CT_LINE} max-[600px]:hidden`}>{also}</div>
      ) : null}
    </article>
  );
};

/** The dashed, striped card that stands in for the session's while its state is unknown; nothing otherwise */
export const UnknownSession = ({ m }: { m: Model }) => {
  const p = ofKind(m.problems, 'unknown')[0];
  if (!p) return null;
  const ticket = p.ticket ? (
    <span className="mono font-[family-name:var(--font-mono)] font-semibold">
      <IdLink id={p.ticket} />
    </span>
  ) : null;
  return (
    <section
      className="state-unknown flex flex-[1_1_100%] flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--r-card)] border border-dashed border-[color:var(--unknown-line)] bg-[image:repeating-linear-gradient(135deg,var(--sunk)_0_10px,var(--surface)_10px_20px)] px-[22px] py-5 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-1.5 max-[600px]:px-3.5 max-[600px]:py-3"
      aria-label="Session state unknown"
    >
      <span className="p-pill solid self-start rounded-[var(--r-pill)] border-0 bg-[color:var(--line-strong)] px-3 py-[5px] font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal tracking-[0.12em] text-[color:var(--fg)] max-[600px]:order-1 max-[600px]:px-[9px] max-[600px]:py-[3px] max-[600px]:text-[10px]">
        STATE UNKNOWN
      </span>
      <div className="su-text flex min-w-0 flex-[1_1_400px] flex-col gap-1 max-[600px]:basis-auto">
        <b className="su-title text-[22px] font-bold max-[600px]:text-[15px]">
          Last known: {p.host}{' '}
          {ticket ? (
            <>
              <span className="long max-[600px]:hidden">running {ticket}</span>
              <span className="short hidden max-[600px]:inline">
                on {ticket}
              </span>
            </>
          ) : (
            'with a session open'
          )}
        </b>
        <span className="su-sub wide text-[13px] text-[color:var(--muted)] max-[600px]:hidden">
          Shown greyed until a heartbeat or a fresh snapshot confirms it.
          Nothing here is assumed to be running.
        </span>
      </div>
    </section>
  );
};
