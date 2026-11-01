import {
  ageText,
  esc,
  hhmm,
  plural,
  runTime,
  seenAgo,
  shortAge,
  span
} from '../format';
import type { Pulse } from '../live';
import type { Model } from '../model';
import type { Detail } from '../state';
import type { SessionState } from '../types';

import { idLink, livePr, parkedText, pr, prTone, prn } from './html';

// The session card: what the session does, where it runs, and the newest live events

export type Tone = '' | 'wait' | 'block';

export type Headline = { tone: Tone; text: string; note: string };

/** A ticket's id link, then its PR, tinted by its live tone, when it has one */
const idPr = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  id: string
): string => {
  const { n, live } = livePr(m, details, { ticket: id });
  return n
    ? `${idLink(id)} ${prn(n, prTone(live?.state ?? null))}`
    : idLink(id);
};

/** One sentence for what happens next, from the session and the head of the queue */
export const headline = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): Headline => {
  const { v, runs } = m;
  if (!runs) return { tone: '', text: 'Loading the runs…', note: '' };
  if (!v)
    return {
      tone: 'wait',
      text: 'The scheduler has recorded no queue view yet. Run <code>cdwr agent install</code> from main.',
      note: ''
    };
  const s: SessionState = m.session ?? { state: 'none' };
  const first = m.next[0];
  const when = m.live
    ? 'the next event'
    : m.nextRun
      ? '~' + hhmm(m.nextRun)
      : 'its next run';
  const on = s.ticket ? ' on ' + idLink(s.ticket) : '';
  let tone: Tone = '',
    text: string;
  if (s.state === 'waiting') {
    tone = 'wait';
    text = `The session${on} waits on a prompt in your terminal.`;
  } else if (m.stuck !== null && first) {
    tone = 'block';
    text = `The session has polled for ${span(m.stuck)} while ${idLink(first.ticket)} (${esc(first.reason)}) waits. Its wait missed it: type anything in its terminal.`;
  } else if (s.state === 'alive') {
    text = `A session is ${s.detail === 'polling' ? 'polling for changes' : 'working'}${on}.`;
    if (first)
      text += ` It takes ${idPr(m, details, first.ticket)} next (${esc(first.reason)}).`;
  } else if (first) {
    text =
      first.reason === 'ready'
        ? `No session is running. The scheduler plans ${idPr(m, details, first.ticket)} at ${when}.`
        : `No session is running. The scheduler starts one for ${idPr(m, details, first.ticket)} (${esc(first.reason)}) at ${when}, unless today's cap or the back-off holds it.`;
  } else {
    const yours =
      m.before.length + m.toLabel.length + m.prs.length + m.ideasPending.length;
    tone =
      m.before.length || m.toLabel.length || m.ideasPending.length
        ? 'wait'
        : '';
    const head = m.before.length
      ? idLink(m.before[0].ticket)
      : m.toLabel.length
        ? idLink(m.toLabel[0].ticket)
        : m.ideasPending.length
          ? 'the idea ' + idLink(m.ideasPending[0].id)
          : '';
    text = yours
      ? `Nothing for the agent. ${plural(yours, 'thing waits', 'things wait')} on you${head ? ', starting with ' + head : ''}.`
      : 'Nothing for the agent, and nothing waits on you.';
  }
  const parked = [...m.parked, ...m.prWaits.values()]
    .map(
      (p) =>
        `${idLink(p.ticket)} ${parkedText(p)}${p.pr ? ' on ' + pr(p.pr) : ''}`
    )
    .join(' · ');
  const asOf = runs.last
    ? `Snapshot from the scheduler run at ${esc(runs.last.when.slice(11))}, ${esc(ageText((now.getTime() - runTime(runs.last.when)) / 6e4))}. A live session can be ahead of it`
    : '';
  const seen =
    s.lastSeen && s.state !== 'none'
      ? `session seen ${esc(seenAgo(s.lastSeen, now))}`
      : '';
  return {
    tone,
    text,
    note: [parked, [asOf, seen].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ')
  };
};

type Status = { label: string; tone: 'live' | 'wait' | 'block' | 'idle' };

const status = (m: Model): Status => {
  const s = m.session?.state ?? 'none';
  if (m.stuck !== null) return { label: 'Session stuck', tone: 'block' };
  if (s === 'alive') return { label: 'Session live', tone: 'live' };
  if (s === 'waiting') return { label: 'Waiting on a prompt', tone: 'wait' };
  if (s === 'stopped') return { label: 'Session stopped', tone: 'idle' };
  return { label: 'No session', tone: 'idle' };
};

/** "attended on mac", from the live session rows: the session's own, else the newest */
export const whereText = (
  m: Pick<Model, 'session' | 'hostSessions'>
): string => {
  const id = m.session?.id;
  for (const h of m.hostSessions) {
    const own = id ? h.sessions.find((x) => x.id === id) : undefined;
    if (own) return `${own.kind} on ${h.host}`;
  }
  const h = m.hostSessions[0];
  return h?.sessions[0] ? `${h.sessions[0].kind} on ${h.host}` : '';
};

/** A feed row's dot: green for a good outcome, red for a failed one, else neutral */
const feedTone = (p: Pulse): string =>
  /failed|closed/.test(p.what)
    ? 'block'
    : /passed|merged|reviewed/.test(p.what)
      ? 'live'
      : '';

const feedRow = (p: Pulse, now: Date): string =>
  `<li><i class="dot ${feedTone(p)}" aria-hidden="true"></i><span class="what">${esc(p.subject)} · ${esc(p.what)}</span><time>${esc(shortAge((now.getTime() - p.at) / 6e4))} ago</time></li>`;

export const renderSession = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): string => {
  const s: SessionState = m.session ?? { state: 'none' };
  const st = status(m);
  const h = headline(m, details, now);
  const where = s.state === 'none' ? '' : whereText(m);
  const seen =
    s.lastSeen && s.state !== 'none'
      ? `seen ${esc(shortAge((now.getTime() - Date.parse(s.lastSeen)) / 6e4))} ago`
      : '';
  const who = [
    where
      ? `<b class="${where.startsWith('attended') ? 'attended' : ''}">${esc(where)}</b>`
      : '',
    seen
  ]
    .filter(Boolean)
    .join(' · ');
  const working = s.ticket && (s.state === 'alive' || s.state === 'waiting');
  const reason = working
    ? m.next.find((x) => x.ticket === s.ticket)?.reason
    : undefined;
  const big = working
    ? `Working on <span class="mono">${idPr(m, details, s.ticket ?? '')}</span>`
    : h.text;
  const sub = working
    ? [reason, m.get(s.ticket ?? '').title].filter(Boolean).map(esc).join(' · ')
    : h.note;
  const feed = m.feed.slice(0, 2);
  return `<article class="card-top session ${st.tone}" data-w="session">
    <div class="ct-head"><button type="button" class="open state" aria-haspopup="dialog"><i class="dot" aria-hidden="true"></i>${esc(st.label)}</button>${who ? `<span class="who-runs">${who}</span>` : ''}</div>
    <div class="big">${big}</div>
    ${sub ? `<p class="ct-sub">${sub}</p>` : ''}
    <ul class="feed">${feed.length ? feed.map((p) => feedRow(p, now)).join('') : '<li class="none">No live event yet</li>'}</ul>
  </article>`;
};
