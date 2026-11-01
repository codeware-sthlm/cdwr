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

export const renderAlert = (m: Model, now: Date): string => {
  if (!m.problems.length) return '';
  const frozen = frozenAt(m.problems) ?? now.getTime();
  const down = ofKind(m.problems, 'connection')[0];
  const link = down
    ? down.retries > 0
      ? ` · channel dropped ${down.retries}×`
      : ' · not connected'
    : '';
  const count = plural(m.problems.length, 'problem', 'problems');
  return `<div class="alert" role="alert"><div class="alert-in">${WARNING}<b class="alert-t">${both(`${esc(count)} — the desk can't vouch for what it shows`, esc(count))}</b><span class="alert-s">${both(`numbers frozen at ${esc(hhmm(frozen))}${link}`, `Numbers are frozen at ${esc(hhmm(frozen))}. Nothing below is assumed to be running.`)}</span><a class="alert-link" href="#problems" data-see-problems>See problems</a></div></div>`;
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
  /** Long and short timer texts */
  time: [string, string];
  body: string;
  /** Replaces the body on the phone */
  short?: string;
  /** Markup below the body; the parts the phone drops carry `wide` */
  extra?: string;
  actions?: string;
};

const connectionCard = (
  p: Extract<Problem, { kind: 'connection' }>,
  now: Date
): Card => {
  const line = [
    p.status ?? 'not connected',
    ...(p.retries > 0 ? [`dropped ${p.retries}×`] : []),
    ...(p.nextAt !== null && p.nextAt > now.getTime()
      ? [`next refresh in ${Math.ceil((p.nextAt - now.getTime()) / 1000)} s`]
      : [])
  ].join(' · ');
  const age = elapsed(now.getTime() - p.since);
  const never = p.retries === 0;
  return {
    pill: 'CONNECTION',
    title: never ? 'Realtime channel not connected' : 'Realtime channel closed',
    time: [`for ${age}`, age],
    body: never
      ? `The desk channel has not connected since ${hhmmss(p.since)}. Every number on the desk is from the last poll; PR states and waits will not resolve until it connects.`
      : `The desk channel dropped at ${hhmmss(p.since)}. Every number on the desk is from that moment; PR states and waits will not resolve until it's back.`,
    short: `${never ? 'Not connected.' : `Dropped ${p.retries}×.`} Waits and PR states won't resolve until it's back.`,
    extra: `<span class="p-mono wide">${esc(line)}</span>`,
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
    time: [`since ${hhmm(p.rowAt)}`, `since ${hhmm(p.rowAt)}`],
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
  time: [`since ${hhmm(p.since)}`, `since ${hhmm(p.since)}`],
  body: `The queue_state row is from ${esc(hhmm(p.since))}, but the newest run started at ${esc(hhmm(p.newestRun))}. The scheduler may have stopped writing it.`
});

const unknownCard = (
  p: Extract<Problem, { kind: 'unknown' }>,
  now: Date
): Card => {
  const silent = Math.round((now.getTime() - p.since) / 6e4);
  const open =
    p.ticket && p.started !== null
      ? `${esc(p.ticket)} started ${esc(hhmm(p.started))} and has no finished_at. `
      : '';
  return {
    pill: 'UNKNOWN STATE',
    title: `${p.host} silent with a run open`,
    time: [
      `no heartbeat for ${silent} m · limit ${Math.round(p.silentMin)} m`,
      `${silent} m silent`
    ],
    body: `${open}Without a heartbeat the desk can't tell running from crashed, so it says neither.`,
    short: "Can't tell running from crashed, so it says neither.",
    extra:
      '<span class="p-note wide">Check the host first. Marking the run abandoned comes with COD-680.</span>'
  };
};

const card = (p: Problem, now: Date): Card => {
  switch (p.kind) {
    case 'connection':
      return connectionCard(p, now);
    case 'data':
      return p.reason === 'parse' ? parseCard(p) : staleCard(p);
    case 'unknown':
      return unknownCard(p, now);
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
};

export const renderProblems = (m: Model, now: Date): string => {
  if (!m.problems.length) return '';
  const seen = new Set<ProblemKey>();
  const cards = m.problems.map((p) => {
    const c = card(p, now);
    const key = problemKey(p);
    const first = !seen.has(key);
    seen.add(key);
    return `<div class="problem"${first ? ` id="problem-${key}"` : ''} data-kind="${p.kind}" tabindex="-1">
      <div class="p-main">
        <div class="p-head"><span class="p-pill">${c.pill}</span><b class="p-title">${esc(c.title)}</b><span class="p-time">${both(esc(c.time[0]), esc(c.time[1]))}</span></div>
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
