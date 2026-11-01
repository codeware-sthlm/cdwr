import { elapsed, esc, hhmm, hhmmss, plural } from '../format';
import {
  type Problem,
  type ProblemKey,
  type ProblemKind,
  frozenAt,
  problemKey
} from '../live';
import type { Model } from '../model';

// The "something is wrong" state: the alert band, one card per problem, and the card that replaces the session's when its state is unknown. Long and short texts sit side by side for the phone.

/** The problems of one kind, narrowed */
export const ofKind = <K extends ProblemKind>(
  list: readonly Problem[],
  kind: K
): Extract<Problem, { kind: K }>[] =>
  list.filter((p): p is Extract<Problem, { kind: K }> => p.kind === kind);

const both = (long: string, short: string): string =>
  `<span class="long">${long}</span><span class="short">${short}</span>`;

const WARNING =
  '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h0"/></svg>';

/** The timers in the cards: what each `data-fmt` counts from its `data-from` */
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

const isFormat = (fmt: string | undefined): fmt is TickFormat =>
  fmt === 'for' ||
  fmt === 'age' ||
  fmt === 'silent' ||
  fmt === 'quiet' ||
  fmt === 'next';

/** Fills the timers under `root`; the markup stays the same from second to second, so only their text moves */
export const updateTicks = (root: ParentNode, now: Date): void => {
  for (const el of root.querySelectorAll<HTMLElement>('.tick')) {
    const { fmt, from } = el.dataset;
    if (!isFormat(fmt) || from === undefined) continue;
    const text = tickText(fmt, Number(from), now);
    if (el.textContent !== text) el.textContent = text;
  }
};

/** An empty timer span; `updateTicks` fills it */
const tick = (fmt: TickFormat, from: number): string =>
  `<span class="tick" data-fmt="${fmt}" data-from="${from}"></span>`;

export const renderAlert = (m: Model): string => {
  if (!m.problems.length) return '';
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
  const sub =
    frozen !== null
      ? both(
          `numbers frozen at ${esc(hhmm(frozen))}${link}`,
          `Numbers are frozen at ${esc(hhmm(frozen))}. Nothing below is assumed to be running.`
        )
      : down
        ? both(
            `live updates down since ${esc(hhmm(down.since))} · polling instead, numbers may lag${dropped}`,
            'Live updates are down. Numbers may lag.'
          )
        : both(
            `${esc(checks)} failing · see Platform`,
            `${esc(checks)} failing.`
          );
  return `<div class="alert" role="alert"><div class="alert-in">${WARNING}<b class="alert-t">${both(`${esc(count)} — ${esc(vouch)}`, esc(count))}</b><span class="alert-s">${sub}</span><a class="alert-link" href="#problems" data-see-problems>See problems</a></div></div>`;
};

/** The label above the widgets the problems leave stale; empty without problems */
export const renderFrozenLabel = (m: Model): string => {
  const frozen = frozenAt(m.problems);
  return frozen === null
    ? ''
    : `EVERYTHING ELSE · FROZEN AT ${esc(hhmm(frozen))}`;
};

const button = (action: string, label: string, primary = false): string =>
  `<button type="button" class="p-btn${primary ? ' primary' : ''}" data-action="${action}">${label}</button>`;

type Card = {
  pill: string;
  title: string;
  /** Long and short timer markup */
  time: [string, string];
  body: string;
  /** Replaces the body on the phone */
  short?: string;
  /** Markup below the body; the parts the phone drops carry `wide` */
  extra?: string;
  actions?: string;
};

const connectionCard = (p: Extract<Problem, { kind: 'connection' }>): Card => {
  const line = [
    p.status ?? 'not connected',
    ...(p.retries > 0 ? [`dropped ${p.retries}×`] : [])
  ].join(' · ');
  const never = p.retries === 0;
  return {
    pill: 'CONNECTION',
    title: never ? 'Realtime channel not connected' : 'Realtime channel closed',
    time: [tick('for', p.since), tick('age', p.since)],
    body: never
      ? `Live updates have not connected since ${hhmmss(p.since)}. The desk polls instead, so numbers may lag by up to a minute and Linear by up to 5.`
      : `Live updates dropped at ${hhmmss(p.since)}. The desk polls instead, so numbers may lag by up to a minute and Linear by up to 5; PR states and waits update on the next poll.`,
    short: `${never ? 'Not connected.' : `Dropped ${p.retries}×.`} Polling; numbers may lag.`,
    extra: `<span class="p-mono wide">${esc(line)}${p.nextAt === null ? '' : tick('next', p.nextAt)}</span>`,
    actions:
      button('reconnect', 'Reconnect now', true) +
      `<span class="wide">${button('reload', 'Reload desk')}</span>`
  };
};

const rawRow = (p: Extract<Problem, { kind: 'data'; reason: 'parse' }>) => {
  const marks = p.issues
    .map(
      (i) =>
        `${esc(i.path)}: <mark>${i.missing ? '⟨missing⟩' : '⟨invalid⟩'}</mark>`
    )
    .join('\n');
  return `<pre class="raw wide">${esc(JSON.stringify(p.view, null, 2))}</pre>${marks ? `<pre class="raw-marks wide">${marks}</pre>` : ''}`;
};

const parseCard = (
  p: Extract<Problem, { kind: 'data'; reason: 'parse' }>
): Card => {
  const fields = p.issues.length
    ? `The row fails at ${p.issues.map((i) => esc(i.path)).join(', ')}.`
    : 'The row does not match the shape the desk reads.';
  const good =
    p.goodAt === null
      ? 'and has no good snapshot yet'
      : `and keeps the last good snapshot, from ${esc(hhmm(p.goodAt))}`;
  return {
    pill: 'DATA',
    title: "queue_state doesn't parse",
    time: [`since ${esc(hhmm(p.rowAt))}`, `since ${esc(hhmm(p.rowAt))}`],
    body: `${fields} The desk ignores the row ${good}.`,
    short:
      p.goodAt === null
        ? 'No good snapshot yet.'
        : `Showing the last good snapshot, from ${esc(hhmm(p.goodAt))}.`,
    extra: rawRow(p),
    actions: `<span class="wide">${button('copy-row', 'Copy raw row')}</span>`
  };
};

const staleCard = (
  p: Extract<Problem, { kind: 'data'; reason: 'stale' }>
): Card => ({
  pill: 'DATA',
  title: 'queue_state is older than the newest run',
  time: [`since ${esc(hhmm(p.since))}`, `since ${esc(hhmm(p.since))}`],
  body: `The queue_state row is from ${esc(hhmm(p.since))}, but the newest run started at ${esc(hhmm(p.newestRun))}. The scheduler may have stopped writing it.`
});

const unknownCard = (p: Extract<Problem, { kind: 'unknown' }>): Card => {
  const open =
    p.ticket && p.started !== null
      ? `${esc(p.ticket)} started ${esc(hhmm(p.started))} and has no finished_at. `
      : '';
  return {
    pill: 'UNKNOWN STATE',
    title: `${p.host} silent with a run open`,
    time: [
      `${tick('quiet', p.since)} · limit ${Math.round(p.silentMin)} m`,
      tick('silent', p.since)
    ],
    body: `${open}Without a heartbeat the desk can't tell running from crashed, so it says neither.`,
    short: "Can't tell running from crashed, so it says neither.",
    extra:
      '<span class="p-note wide">Check the host first. Marking the run abandoned comes with COD-680.</span>'
  };
};

const checkCard = (p: Extract<Problem, { kind: 'check' }>): Card => ({
  pill: 'CHECK',
  title: p.name,
  time:
    p.since === null
      ? ['never seen', 'never']
      : [`since ${esc(hhmm(p.since))}`, `since ${esc(hhmm(p.since))}`],
  body: `${esc(p.text)}. A failing check says nothing about the queue, so its numbers stand.`,
  short: esc(p.text),
  actions:
    '<button type="button" class="p-btn" data-view="platform">Platform ›</button>'
});

const card = (p: Problem): Card => {
  switch (p.kind) {
    case 'check':
      return checkCard(p);
    case 'connection':
      return connectionCard(p);
    case 'data':
      return p.reason === 'parse' ? parseCard(p) : staleCard(p);
    case 'unknown':
      return unknownCard(p);
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
};

/** The id a Platform row links to: one card per check, the first card of any other key */
export const problemId = (p: Problem): string =>
  p.kind === 'check'
    ? `problem-check-${p.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    : `problem-${problemKey(p)}`;

/** The cards as markup that holds still; `updateTicks` fills the timers */
export const renderProblems = (m: Model): string => {
  if (!m.problems.length) return '';
  const seen = new Set<ProblemKey>();
  const cards = m.problems.map((p) => {
    const c = card(p);
    const key = problemKey(p);
    const first = p.kind === 'check' || !seen.has(key);
    seen.add(key);
    return `<div class="problem"${first ? ` id="${problemId(p)}"` : ''} data-kind="${p.kind}" tabindex="-1">
      <div class="p-main">
        <div class="p-head"><span class="p-pill">${c.pill}</span><b class="p-title">${esc(c.title)}</b><span class="p-time">${both(c.time[0], c.time[1])}</span></div>
        <span class="p-body">${c.short ? both(c.body, c.short) : c.body}</span>
        ${c.extra ?? ''}
      </div>
      ${c.actions ? `<div class="p-actions">${c.actions}</div>` : ''}
    </div>`;
  });
  return `<h2 class="problems-h">PROBLEMS · ${m.problems.length}</h2>${cards.join('')}`;
};

/** The dashed, striped card that stands in for the session card while its state is unknown */
export const renderUnknownSession = (m: Model): string => {
  const p = ofKind(m.problems, 'unknown')[0];
  if (!p) return '';
  const ticket = p.ticket ? `<span class="mono">${esc(p.ticket)}</span>` : '';
  return `<section class="state-unknown" aria-label="Session state unknown">
    <span class="p-pill solid">STATE UNKNOWN</span>
    <div class="su-text">
      <b class="su-title">Last known: ${esc(p.host)} ${p.ticket ? both(`running ${ticket}`, `on ${ticket}`) : 'with a session open'}</b>
      <span class="su-sub wide">Shown greyed until a heartbeat or a fresh snapshot confirms it. Nothing here is assumed to be running.</span>
    </div>
  </section>`;
};
