import {
  ageText,
  esc,
  hhmm,
  planWhen,
  plural,
  runTime,
  seenAgo,
  shortAge,
  span,
  txt
} from '../format';
import type { Pulse } from '../live';
import type { Model } from '../model';
import type { Detail } from '../state';
import type { SessionState } from '../types';

import {
  idLink,
  livePr,
  parkedText,
  pr,
  prPill,
  prTone,
  prn,
  queuePr
} from './html';
import { countedRows, waitRows } from './waiting';

// The session card: what the session does, where it runs, and the newest live events

export type Tone = '' | 'wait' | 'block';

export type Headline = { tone: Tone; text: string; note: string };

/** A ticket's id link, then its PR, tinted by its live tone, when it has one */
const idPr = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  id: string
): string => {
  const { n, live } = livePr(m, details, { ticket: id, pr: queuePr(m, id) });
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
    const rows = countedRows(waitRows(m, details, now));
    const yours = rows.length;
    tone = rows.some((r) => r.kind !== 'review') ? 'wait' : '';
    const head = rows[0]
      ? (rows[0].kind === 'idea' ? 'the idea ' : '') + idLink(rows[0].id)
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

/** "Step 3 of 5" with a bar and the next step, for the working ticket; empty without a plan */
const stepLine = (d: Detail | undefined): string =>
  d && d.steps
    ? `<div class="ct-step"><div class="bar" aria-hidden="true"><i style="width:${Math.round((d.done / d.steps) * 100)}%"></i></div><span>Step ${Math.min(d.done + 1, d.steps)} of ${d.steps}</span>${d.next ? `<span class="ct-next">${txt(d.next)}</span>` : ''}</div>`
    : '';

/** What the working ticket is parked on, and for how long; empty when it is not parked */
const waitLine = (m: Model, ticket: string, now: Date): string => {
  const p = m.parked.find((x) => x.ticket === ticket) ?? m.prWaits.get(ticket);
  if (!p) return '';
  const age =
    p.since && !p.resolved
      ? ` for ${esc(shortAge((now.getTime() - Date.parse(p.since)) / 6e4))}`
      : '';
  return `<div class="ct-wait">${parkedText(p)}${p.pr ? ' on ' + pr(p.pr) : ''}${age}</div>`;
};

/** The working ticket's own PR as the feed's first row; empty without a PR */
const ownPrRow = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  ticket: string,
  now: Date
): string => {
  const x = { ticket, pr: queuePr(m, ticket) };
  const { n, live } = livePr(m, details, x);
  if (!n) return '';
  const { pill, age } = prPill(m, details, x, now);
  return `<li class="own">${prn(n, prTone(live?.state ?? null))} ${pill}${age}</li>`;
};

/** "Plan: 5h 30% · resets 14:00 · 7d 18%", a window over its pace marked bad; empty without a live 5-hour window */
const planLine = (m: Model, now: Date): string => {
  const five = m.plan.five_hour;
  if (!five || five.reset) return '';
  const pct = (w: typeof five) =>
    `<span class="${w.verdict === 'ok' ? '' : 'bad'}">${Math.round(w.used)}%</span>`;
  const seven = m.plan.seven_day;
  return `<div class="ct-plan">Plan: 5h ${pct(five)} · resets ${esc(planWhen(five.resetsAt, now))}${seven && !seven.reset ? ` · 7d ${pct(seven)}` : ''}</div>`;
};

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
  const ticket = working ? (s.ticket ?? '') : '';
  const own = ticket ? ownPrRow(m, details, ticket, now) : '';
  const rows =
    own +
    m.feed
      .slice(0, 2)
      .map((p) => feedRow(p, now))
      .join('');
  const then = ticket ? m.next.find((x) => x.ticket !== ticket) : undefined;
  const plan = planLine(m, now);
  const also = alsoText(m);
  return `<article class="card-top session ${st.tone}" data-w="session">
    <div class="ct-head"><button type="button" class="open state" aria-haspopup="dialog"><i class="dot" aria-hidden="true"></i>${esc(st.label)}</button>${who ? `<span class="who-runs">${who}</span>` : ''}</div>
    <div class="big">${big}</div>
    ${sub ? `<p class="ct-sub">${sub}</p>` : ''}
    ${ticket ? stepLine(details.get(ticket)) + waitLine(m, ticket, now) : ''}
    <h4 class="feed-h">Latest events</h4>
    <ul class="feed">${rows || '<li class="none">No live event yet</li>'}</ul>
    ${then ? `<div class="ct-then">Then: ${idLink(then.ticket)} (${esc(then.reason)})</div>` : ''}
    ${plan}
    ${also ? `<div class="ct-also">${esc(also)}</div>` : ''}
  </article>`;
};
