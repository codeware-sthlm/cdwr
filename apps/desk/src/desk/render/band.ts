import { ageText, esc, hhmm, plural, runTime, seenAgo, span } from '../format';
import type { Model } from '../model';
import type { SessionState } from '../types';

import {
  hostName,
  idLink,
  loadMeter,
  parkedText,
  pr,
  sessionLabel
} from './html';

// The band under the header: the session, one sentence on what happens next, the limit and the scheduler

export type Tone = '' | 'wait' | 'block';

export type Headline = { tone: Tone; text: string; note: string };

/** One sentence for what happens next, from the session and the head of the queue */
export const headline = (m: Model, now: Date): Headline => {
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
  const when = m.nextRun ? '~' + hhmm(m.nextRun) : 'its next run';
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
      text += ` It takes ${idLink(first.ticket)} next (${esc(first.reason)}).`;
  } else if (first) {
    text =
      first.reason === 'ready'
        ? `No session is running. The scheduler plans ${idLink(first.ticket)} at ${when}.`
        : `No session is running. The scheduler starts one for ${idLink(first.ticket)} (${esc(first.reason)}) at ${when}, unless today's cap or the back-off holds it.`;
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

export type Band = { className: string; html: string };

export const renderBand = (m: Model, now: Date): Band => {
  const { runs } = m;
  const h = headline(m, now);
  const s: SessionState = m.session ?? { state: 'none' };
  const job = runs?.job ?? null;
  const sched = !runs
    ? '–'
    : m.schedulerStale
      ? `silent ${Math.floor(m.lastRunAge ?? 0)} h`
      : m.installStale
        ? job?.host === 'container'
          ? 'image out of date'
          : 'install out of date'
        : m.runProblems.length
          ? plural(m.runProblems.length, 'problem', 'problems')
          : 'OK';
  const bad =
    runs !== null &&
    (m.schedulerStale || m.installStale || m.runProblems.length > 0);
  const host = job?.host
    ? '<br>' + esc(hostName(job.host)) + (job.rev ? ' · ' + esc(job.rev) : '')
    : '';
  return {
    className: 'now ' + (bad && !h.tone ? 'block' : h.tone),
    html: `<button type="button" class="pill ${esc(s.state)}${m.stuck !== null ? ' stuck' : ''}" data-w="session" aria-haspopup="dialog"><i aria-hidden="true"></i>${m.stuck !== null ? 'Session stuck' : esc(sessionLabel(s.state))}${s.state !== 'none' && s.detail ? ` · ${esc(s.detail)}` : ''}</button>
    <div class="headline"><p>${h.text}</p>${h.note ? `<small>${h.note}</small>` : ''}</div>
    <button type="button" class="gauge" data-w="limit" aria-haspopup="dialog"><span class="k">Limit · agent PRs in flight</span><b>${m.limit.used} <small>of ${m.limit.max} · ${m.limit.used >= m.limit.max ? 'no new ticket starts' : plural(m.limit.max - m.limit.used, 'slot', 'slots') + ' free'}</small></b>${loadMeter(m)}</button>
    <button type="button" class="gauge" data-w="scheduler" aria-haspopup="dialog"><span class="k">Scheduler</span><b>${esc(sched)}</b><small style="color:var(--muted);font-size:.78rem">${runs?.last ? 'last ' + esc(runs.last.when.slice(11)) + ' · next ' + (m.nextRun ? hhmm(m.nextRun) : '?') : 'no runs yet'}${host}</small></button>`
  };
};
