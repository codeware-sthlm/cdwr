import { type ReactNode, type RefObject, useRef } from 'react';

import { QUEUE_WRITER_MIN } from '../constants';
import { elapsed, hhmm, hhmmss, plural } from '../format';
import {
  type Problem,
  type ProblemKey,
  frozenAt,
  ofKind,
  problemId,
  problemKey,
  writerList
} from '../live';
import type { Model } from '../model';

import { CmdButton, ControlStatus } from './controls';
import { IdLink } from './links';

// The "something is wrong" state: the alert band, one card per problem, and the card that replaces
// the session's when its state is unknown. Long and short texts sit side by side for the phone.

/** What the alert's link and the cards' buttons do */
export type ProblemActions = {
  /** Scrolls to the problems, back on the desk when another view shows */
  seeProblems: () => void;
  reconnect: () => void;
  reload: () => void;
  /** Copies the raw row's text, or selects it when the clipboard is blocked */
  copyRow: (raw: HTMLElement) => void;
  platform: () => void;
  /** Asks to confirm, then marks the open run abandoned */
  abandon: () => void;
};

// The phone keeps the short text and drops what carries `wide`
const WIDE = 'wide max-[600px]:hidden';
const MONO =
  'font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal text-[color:var(--muted)]';
const BTN =
  'p-btn min-h-[var(--tap)] cursor-pointer rounded-[9px] px-4 py-0 text-[13px] disabled:cursor-default disabled:opacity-50';
const BTN_PLAIN = `${BTN} border border-[color:var(--problem-line)] bg-transparent text-[color:var(--fg)] hover:border-[color:var(--muted)]`;
const BTN_PRIMARY = `${BTN} primary border-0 bg-[color:var(--block)] font-semibold text-[#2a0d09]`;
const RAW =
  'overflow-x-auto border border-[#3a2420] bg-[#151110] px-3 py-2.5 font-[family-name:var(--font-mono)] text-[12px] leading-[normal] font-normal text-[#c8c3ba]';
const MARK = 'bg-transparent text-[color:var(--block)]';
const LABEL =
  'text-[11px] leading-[normal] font-medium font-[family-name:var(--font-mono)] tracking-[0.14em]';

const Both = ({ long, short }: { long: ReactNode; short: ReactNode }) => (
  <>
    <span className="long max-[600px]:hidden">{long}</span>
    <span className="short hidden max-[600px]:inline">{short}</span>
  </>
);

const Warning = () => (
  <svg
    className="max-[600px]:hidden"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h0" />
  </svg>
);

/** The timers in the cards: what each counts from its time */
export type TickFormat = 'for' | 'age' | 'silent' | 'quiet' | 'next';

/** The text of one timer at `now`; empty once a countdown has run out */
export const tickText = (fmt: TickFormat, from: number, now: Date): string => {
  const ms = now.getTime() - from;
  switch (fmt) {
    case 'for':
      return `for ${elapsed(ms)}`;
    case 'age':
      return elapsed(ms);
    case 'silent':
      return `${Math.round(ms / 6e4)} m silent`;
    case 'quiet':
      return `no heartbeat for ${Math.round(ms / 6e4)} m`;
    case 'next':
      return ms < 0 ? `next refresh in ${Math.ceil(-ms / 1000)} s` : '';
    default: {
      const unreachable: never = fmt;
      return unreachable;
    }
  }
};

/** A timer; the page renders every second while problems show, so only its text moves */
export const Tick = ({
  fmt,
  from,
  now
}: {
  fmt: TickFormat;
  from: number;
  now: Date;
}) => (
  // The separator shows only while the countdown has text
  <span
    className={
      fmt === 'next'
        ? "tick next [&:not(:empty)]:before:content-['_·_']"
        : 'tick'
    }
  >
    {tickText(fmt, from, now)}
  </span>
);

export const Alert = ({
  m,
  onSeeProblems
}: {
  m: Model;
  onSeeProblems: () => void;
}) => {
  if (!m.problems.length) return null;
  const frozen = frozenAt(m.problems);
  const down = ofKind(m.problems, 'connection')[0];
  const link = down
    ? down.retries > 0
      ? ` · channel dropped ${down.retries}×`
      : ' · not connected'
    : '';
  const count = plural(m.problems.length, 'problem', 'problems');
  const checks = plural(ofKind(m.problems, 'check').length, 'check', 'checks');
  // Failing checks alone leave the numbers standing
  const vouch = m.problems.every((p) => p.kind === 'check')
    ? 'a health check is failing'
    : "the desk can't vouch for what it shows";
  const dropped = down && down.retries > 0 ? link : '';
  const writers = ofKind(m.problems, 'data').filter(
    (p) => p.reason === 'writers'
  );
  const onlyWriters = writers.length === m.problems.length;
  const title = onlyWriters
    ? `${count} — another host publishes the queue`
    : `${count} — ${vouch}`;
  const sub =
    frozen !== null ? (
      <Both
        long={`numbers frozen at ${hhmm(frozen)}${link}`}
        short={`Numbers are frozen at ${hhmm(frozen)}. Nothing below is assumed to be running.`}
      />
    ) : down ? (
      <Both
        long={`live updates down since ${hhmm(down.since)} · polling instead, numbers may lag${dropped}`}
        short="Live updates are down. Numbers may lag."
      />
    ) : onlyWriters ? (
      `the desk reads ${writers[0].used}`
    ) : (
      <Both
        long={`${checks} failing · see Platform`}
        short={`${checks} failing.`}
      />
    );
  return (
    <div
      className="alert border-b border-[color:var(--alert-line)] bg-[color:var(--alert-bg)] text-[color:var(--block)] max-[600px]:rounded-[var(--r-card)] max-[600px]:border"
      role="alert"
    >
      {/* The band runs edge to edge; its content stays out of the status bar and the notch */}
      <div className="alert-in mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-3 pt-[max(12px,env(safe-area-inset-top))] pr-[var(--pad-right)] pb-3 pl-[var(--pad-left)] max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-1 max-[600px]:pt-3 max-[600px]:pr-3.5 max-[600px]:pb-3 max-[600px]:pl-3.5">
        <Warning />
        <b className="alert-t text-[14px] font-semibold text-[color:var(--alert-fg)]">
          <Both long={title} short={count} />
        </b>
        <span className="alert-s text-[12px] text-[color:var(--alert-sub)]">
          {sub}
        </span>
        <a
          className="alert-link ml-auto inline-flex min-h-[var(--tap)] items-center text-[13px] font-semibold text-[color:var(--alert-fg)] underline max-[600px]:hidden"
          href="#problems"
          onClick={(e) => {
            e.preventDefault();
            onSeeProblems();
          }}
        >
          See problems
        </a>
      </div>
    </div>
  );
};

/** The label above the widgets the problems leave stale; empty without problems */
export const frozenLabel = (m: Model): string => {
  const frozen = frozenAt(m.problems);
  return frozen === null ? '' : `EVERYTHING ELSE · FROZEN AT ${hhmm(frozen)}`;
};

export const FrozenLabel = ({ m }: { m: Model }) => <>{frozenLabel(m)}</>;

type Card = {
  pill: string;
  title: string;
  /** The long and the short time */
  time: [ReactNode, ReactNode];
  body: ReactNode;
  /** Replaces the body on the phone */
  short?: ReactNode;
  /** Below the body; the parts the phone drops carry `wide` */
  extra?: ReactNode;
  actions?: ReactNode;
};

type CardProps = {
  m: Model;
  now: Date;
  actions: ProblemActions;
  /** The parse card's raw row, for its copy button */
  raw: RefObject<HTMLPreElement | null>;
};

const connectionCard = (
  p: Extract<Problem, { kind: 'connection' }>,
  { now, actions }: CardProps
): Card => {
  const line = [
    p.status ?? 'not connected',
    ...(p.retries > 0 ? [`dropped ${p.retries}×`] : [])
  ].join(' · ');
  const never = p.retries === 0;
  return {
    pill: 'CONNECTION',
    title: never ? 'Realtime channel not connected' : 'Realtime channel closed',
    time: [
      <Tick fmt="for" from={p.since} now={now} />,
      <Tick fmt="age" from={p.since} now={now} />
    ],
    body: never
      ? `Live updates have not connected since ${hhmmss(p.since)}. The desk polls instead, so numbers may lag by up to a minute and Linear by up to 5.`
      : `Live updates dropped at ${hhmmss(p.since)}. The desk polls instead, so numbers may lag by up to a minute and Linear by up to 5; PR states and waits update on the next poll.`,
    short: `${never ? 'Not connected.' : `Dropped ${p.retries}×.`} Polling; numbers may lag.`,
    extra: (
      <span className={`p-mono ${WIDE} ${MONO}`}>
        {line}
        {p.nextAt === null ? null : (
          <Tick fmt="next" from={p.nextAt} now={now} />
        )}
      </span>
    ),
    actions: (
      <>
        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={actions.reconnect}
        >
          Reconnect now
        </button>
        <span className={WIDE}>
          <button type="button" className={BTN_PLAIN} onClick={actions.reload}>
            Reload desk
          </button>
        </span>
      </>
    )
  };
};

const parseCard = (
  p: Extract<Problem, { kind: 'data'; reason: 'parse' }>,
  { actions, raw }: CardProps
): Card => {
  const fields = p.issues.length
    ? `The row fails at ${p.issues.map((i) => i.path).join(', ')}.`
    : 'The row does not match the shape the desk reads.';
  const good =
    p.goodAt === null
      ? 'and has no good snapshot yet'
      : `and keeps the last good snapshot, from ${hhmm(p.goodAt)}`;
  return {
    pill: 'DATA',
    title: "queue_state doesn't parse",
    time: [`since ${hhmm(p.rowAt)}`, `since ${hhmm(p.rowAt)}`],
    body: `${fields} The desk ignores the row ${good}.`,
    short:
      p.goodAt === null
        ? 'No good snapshot yet.'
        : `Showing the last good snapshot, from ${hhmm(p.goodAt)}.`,
    extra: (
      <>
        <pre
          className={`raw ${WIDE} ${RAW} max-h-[14em] ${p.issues.length ? 'rounded-t-[8px] rounded-b-none' : 'rounded-[8px]'}`}
          ref={raw}
        >
          {JSON.stringify(p.view, null, 2)}
        </pre>
        {p.issues.length ? (
          <pre
            className={`raw-marks ${WIDE} ${RAW} -mt-px rounded-t-none rounded-b-[8px]`}
          >
            {p.issues.map((i, n) => (
              <span key={`${i.path}-${n}`}>
                {n ? '\n' : ''}
                {i.path}:{' '}
                <mark className={MARK}>
                  {i.missing ? '⟨missing⟩' : '⟨invalid⟩'}
                </mark>
              </span>
            ))}
          </pre>
        ) : null}
      </>
    ),
    actions: (
      <span className={WIDE}>
        <button
          type="button"
          className={BTN_PLAIN}
          onClick={() => {
            if (raw.current) actions.copyRow(raw.current);
          }}
        >
          Copy raw row
        </button>
      </span>
    )
  };
};

const staleCard = (
  p: Extract<Problem, { kind: 'data'; reason: 'stale' }>
): Card => ({
  pill: 'DATA',
  title: 'queue_state is older than the newest run',
  time: [`since ${hhmm(p.since)}`, `since ${hhmm(p.since)}`],
  body: `The queue_state row is from ${hhmm(p.since)}, but the newest run started at ${hhmm(p.newestRun)}. The scheduler may have stopped writing it.`
});

const WINDOW =
  QUEUE_WRITER_MIN % 60 === 0
    ? `${QUEUE_WRITER_MIN / 60} h`
    : `${QUEUE_WRITER_MIN} min`;

const writersCard = (
  p: Extract<Problem, { kind: 'data'; reason: 'writers' }>
): Card => ({
  pill: 'DATA',
  title: 'More than one host publishes the queue',
  time: [`last ${hhmm(p.since)}`, `last ${hhmm(p.since)}`],
  body: `The desk reads ${p.used}; ${writerList(p.others)} also wrote a queue_state row in the last ${WINDOW}. Stop the scheduler on the host that should not publish: "cdwr agent uninstall" on a Mac, or stop the agent container; a paused scheduler still publishes. The row stops counting once it is older than ${WINDOW}.`,
  short: `Also published by ${p.others.map((o) => o.host).join(', ')}.`
});

const AbandonControl = ({
  m,
  onAbandon
}: {
  m: Model;
  onAbandon: () => void;
}) => {
  const c = m.controls;
  if (!c)
    return (
      <span className={`p-note ${WIDE} text-[12px] text-[color:var(--muted)]`}>
        Check the host first, then mark the run abandoned from the CLI or with a
        control token in Settings.
      </span>
    );
  return (
    <>
      <span className={`p-note ${WIDE} text-[12px] text-[color:var(--muted)]`}>
        Check the host first.
      </span>{' '}
      <span className="p-ctl flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CmdButton
          cmd="abandon"
          className={BTN_PLAIN}
          label={c.confirming ? 'Confirm abandon' : 'Mark run abandoned'}
          view={c.states.abandon}
          onClick={onAbandon}
        />
        <ControlStatus view={c.states.abandon} />
      </span>
    </>
  );
};

const unknownCard = (
  p: Extract<Problem, { kind: 'unknown' }>,
  { m, now, actions }: CardProps
): Card => ({
  pill: 'UNKNOWN STATE',
  title: `${p.host} silent with a run open`,
  time: [
    <>
      <Tick fmt="quiet" from={p.since} now={now} /> · limit{' '}
      {Math.round(p.silentMin)} m
    </>,
    <Tick fmt="silent" from={p.since} now={now} />
  ],
  body: (
    <>
      {p.ticket && p.started !== null ? (
        <>
          <IdLink id={p.ticket} /> started {hhmm(p.started)} and has no
          finished_at.{' '}
        </>
      ) : null}
      Without a heartbeat the desk can&apos;t tell running from crashed, so it
      says neither.
    </>
  ),
  short: "Can't tell running from crashed, so it says neither.",
  extra: <AbandonControl m={m} onAbandon={actions.abandon} />
});

const checkCard = (
  p: Extract<Problem, { kind: 'check' }>,
  { actions }: CardProps
): Card => ({
  pill: 'CHECK',
  title: p.name,
  time:
    p.since === null
      ? ['never seen', 'never']
      : [`since ${hhmm(p.since)}`, `since ${hhmm(p.since)}`],
  body: `${p.text}. A failing check says nothing about the queue, so its numbers stand.`,
  short: p.text,
  actions: (
    <button type="button" className={BTN_PLAIN} onClick={actions.platform}>
      Platform ›
    </button>
  )
});

const card = (p: Problem, props: CardProps): Card => {
  switch (p.kind) {
    case 'check':
      return checkCard(p, props);
    case 'connection':
      return connectionCard(p, props);
    case 'data':
      switch (p.reason) {
        case 'parse':
          return parseCard(p, props);
        case 'stale':
          return staleCard(p);
        case 'writers':
          return writersCard(p);
        default: {
          const unreachable: never = p;
          return unreachable;
        }
      }
    case 'unknown':
      return unknownCard(p, props);
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
};

const ProblemCard = ({
  p,
  id,
  ...rest
}: Omit<CardProps, 'raw'> & { p: Problem; id: string | undefined }) => {
  const raw = useRef<HTMLPreElement>(null);
  const c = card(p, { ...rest, raw });
  return (
    <div
      className="problem flex flex-wrap items-start gap-x-6 gap-y-[14px] rounded-[var(--r-card)] border border-[color:var(--problem-line)] bg-[color:var(--problem-bg)] px-5 py-[18px] max-[600px]:gap-2 max-[600px]:px-3.5 max-[600px]:py-3"
      id={id}
      data-kind={p.kind}
      tabIndex={-1}
    >
      <div className="p-main flex min-w-0 flex-[1_1_520px] flex-col gap-1.5 max-[600px]:basis-full">
        <div className="p-head flex flex-wrap items-center gap-2.5 max-[600px]:gap-2">
          <span className="p-pill rounded-[var(--r-pill)] border border-[color:var(--alert-line)] px-[9px] py-[3px] font-[family-name:var(--font-mono)] text-[10px] leading-[normal] font-normal tracking-[0.1em] text-[color:var(--block)] max-[600px]:order-1 max-[600px]:px-[7px] max-[600px]:py-[2px] max-[600px]:text-[9px]">
            {c.pill}
          </span>
          <b className="p-title text-[15px] font-semibold max-[600px]:order-3 max-[600px]:basis-full max-[600px]:text-[13px]">
            {c.title}
          </b>
          <span
            className={`p-time ${MONO} max-[600px]:order-2 max-[600px]:ml-auto max-[600px]:text-[10px]`}
          >
            <Both long={c.time[0]} short={c.time[1]} />
          </span>
        </div>
        <span className="p-body text-[13px] text-[#c8c3ba] max-[600px]:text-[12px]">
          {c.short ? <Both long={c.body} short={c.short} /> : c.body}
        </span>
        {c.extra}
      </div>
      {c.actions ? (
        <div className="p-actions flex shrink-0 gap-2 max-[600px]:[&:not(:has(>:not(.wide)))]:hidden">
          {c.actions}
        </div>
      ) : null}
    </div>
  );
};

/** One card per problem; the first of each key carries the id a Platform row links to */
export const Problems = ({
  m,
  now,
  actions
}: {
  m: Model;
  now: Date;
  actions: ProblemActions;
}) => {
  if (!m.problems.length) return null;
  const seen = new Set<ProblemKey>();
  return (
    <>
      <h2 className={`problems-h ${LABEL} text-[color:var(--block)]`}>
        PROBLEMS · {m.problems.length}
      </h2>
      {m.problems.map((p, n) => {
        const key = problemKey(p);
        const first = p.kind === 'check' || !seen.has(key);
        seen.add(key);
        return (
          <ProblemCard
            key={`${key}-${n}`}
            p={p}
            id={first ? problemId(p) : undefined}
            m={m}
            now={now}
            actions={actions}
          />
        );
      })}
    </>
  );
};
