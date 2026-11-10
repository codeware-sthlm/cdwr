import { ageText, esc, hhmm, plural, runTime, seenAgo, span } from '../format';
import type { Model } from '../model';
import type { Detail } from '../state';
import type { PrRef, SessionState } from '../types';

import {
  type PrTone,
  idLink,
  livePr,
  parkedPlain,
  pr,
  prTone,
  prn,
  queuePr
} from './html';
import { countedRows, waitRows } from './waiting';

// The session card: what the session does, where it runs, and the newest live events

export type Tone = '' | 'wait' | 'block';

/** One piece of a headline: plain text, a ticket id, a PR (tinted `prn`, or a plain id link), or code */
export type Part =
  | string
  | { id: string }
  | { prn: PrRef; tone: PrTone }
  | { pr: PrRef }
  | { code: string };

export type Headline = { tone: Tone; text: Part[]; note: Part[] };

/** A headline's parts as HTML; the strings in them are escaped here */
export const headlineHtml = (parts: Part[]): string =>
  parts
    .map((p) =>
      typeof p === 'string'
        ? esc(p)
        : 'id' in p
          ? idLink(p.id)
          : 'prn' in p
            ? prn(p.prn, p.tone)
            : 'pr' in p
              ? pr(p.pr)
              : `<code>${esc(p.code)}</code>`
    )
    .join('');

/** A ticket's id, then its PR, tinted by its live tone, when it has one */
export const idPr = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  id: string
): Part[] => {
  const { n, live } = livePr(m, details, { ticket: id, pr: queuePr(m, id) });
  return n
    ? [{ id }, ' ', { prn: n, tone: prTone(live?.state ?? null) }]
    : [{ id }];
};

/** One sentence for what happens next, from the session and the head of the queue */
export const headline = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): Headline => {
  const { v, runs } = m;
  if (!runs) return { tone: '', text: ['Loading the runs…'], note: [] };
  if (!v)
    return {
      tone: 'wait',
      text: [
        'The scheduler has recorded no queue view yet. Run ',
        { code: 'cdwr agent install' },
        ' from main.'
      ],
      note: []
    };
  const s: SessionState = m.session ?? { state: 'none' };
  const first = m.next[0];
  const when = m.live
    ? 'the next event'
    : m.nextRun
      ? '~' + hhmm(m.nextRun)
      : 'its next run';
  const on: Part[] = s.ticket ? [' on ', { id: s.ticket }] : [];
  let tone: Tone = '',
    text: Part[];
  if (s.state === 'waiting') {
    tone = 'wait';
    text = ['The session', ...on, ' waits on a prompt in your terminal.'];
  } else if (m.stuck !== null && first) {
    tone = 'block';
    text = [
      `The session has polled for ${span(m.stuck)} while `,
      { id: first.ticket },
      ` (${first.reason}) waits. Its wait missed it: type anything in its terminal.`
    ];
  } else if (s.state === 'alive') {
    text = [
      `A session is ${s.detail === 'polling' ? 'polling for changes' : 'working'}`,
      ...on,
      '.'
    ];
    if (first)
      text.push(
        ' It takes ',
        ...idPr(m, details, first.ticket),
        ` next (${first.reason}).`
      );
  } else if (first) {
    text =
      first.reason === 'ready'
        ? [
            'No session is running. The scheduler plans ',
            ...idPr(m, details, first.ticket),
            ` at ${when}.`
          ]
        : [
            'No session is running. The scheduler starts one for ',
            ...idPr(m, details, first.ticket),
            ` (${first.reason}) at ${when}, unless today's cap or the back-off holds it.`
          ];
  } else {
    const rows = countedRows(waitRows(m, details, now));
    const yours = rows.length;
    tone = rows.some((r) => r.kind !== 'review') ? 'wait' : '';
    text = yours
      ? [
          `Nothing for the agent. ${plural(yours, 'thing waits', 'things wait')} on you`,
          ...(rows[0]
            ? [
                ', starting with ',
                ...(rows[0].kind === 'idea' ? ['the idea '] : []),
                { id: rows[0].id }
              ]
            : []),
          '.'
        ]
      : ['Nothing for the agent, and nothing waits on you.'];
  }
  const parked: Part[][] = [...m.parked, ...m.prWaits.values()].map((p) => [
    { id: p.ticket },
    ` ${parkedPlain(p)}`,
    ...(p.pr ? [' on ', { pr: p.pr }] : [])
  ]);
  const asOf = runs.last
    ? `Snapshot from the scheduler run at ${runs.last.when.slice(11)}, ${ageText((now.getTime() - runTime(runs.last.when)) / 6e4)}. A live session can be ahead of it`
    : '';
  const seen =
    s.lastSeen && s.state !== 'none'
      ? `session seen ${seenAgo(s.lastSeen, now)}`
      : '';
  const snapshot = [asOf, seen].filter(Boolean).join(', ');
  return {
    tone,
    text,
    note: [...parked, ...(snapshot ? [[snapshot]] : [])].flatMap((p, i) =>
      i ? [' · ', ...p] : p
    )
  };
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
