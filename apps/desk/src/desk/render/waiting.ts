import { esc, shortAge } from '../format';
import { type Model, prOf } from '../model';
import type { Detail } from '../state';
import type { PrRef } from '../types';

import { livePr, prTone, prn } from './html';

// The Waiting on you card: plans, questions, tickets to label and ideas, each with how long it has waited

/** Rows the phone shows before "+ n more — open all"; the desktop shows every row */
export const PHONE_ROWS = 2;

export type WaitRow = {
  id: string;
  title: string;
  url: string;
  kind: 'plan' | 'question' | 'ready to label' | 'idea';
  /** The ticket's pull request; null without one, and always for an idea */
  pr: PrRef | null;
  /** Minutes waited; null without activity to tell */
  age: number | null;
};

/** What waits on you, in the queue view's order: plans and questions, then tickets to label, then ideas */
export const waitRows = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): WaitRow[] => {
  const row = (id: string, kind: WaitRow['kind']): WaitRow => {
    const { title, url } = m.get(id);
    return {
      id,
      title,
      url,
      kind,
      pr: prOf(details, id),
      age: m.waitAge.get(id) ?? null
    };
  };
  return [
    ...m.before.map((x) =>
      row(x.ticket, x.kind === 'plan' ? 'plan' : 'question')
    ),
    ...m.toLabel.map((x) => row(x.ticket, 'ready to label')),
    ...m.ideasPending.map((i): WaitRow => ({
      id: i.id,
      title: i.title,
      url: i.url,
      kind: 'idea',
      pr: null,
      age: i.createdAt ? (now.getTime() - Date.parse(i.createdAt)) / 6e4 : null
    }))
  ];
};

const rowHTML =
  (m: Model, details: ReadonlyMap<string, Detail>) =>
  (r: WaitRow): string => {
    const tone = prTone(
      livePr(m, details, { ticket: r.id, pr: r.pr }).live?.state ?? null
    );
    return `<li class="wrow-li"><a class="wrow" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="id">${esc(r.id)}</span><span class="t">${esc(r.title)}</span><span class="kind">${esc(r.kind)}</span>${r.age === null ? '' : `<time>${esc(shortAge(r.age))}</time>`}</a>${prn(r.pr, tone)}</li>`;
  };

export const renderWaiting = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): string => {
  const loading = !m.runs;
  const rows = loading ? [] : waitRows(m, details, now);
  const hidden = rows.length - PHONE_ROWS;
  const body = loading
    ? '<p class="none">Loading…</p>'
    : rows.length
      ? `<ul class="wrows">${rows.map(rowHTML(m, details)).join('')}</ul>${hidden > 0 ? `<button type="button" class="more-all" aria-haspopup="dialog">+ ${hidden} more — open all</button>` : ''}`
      : '<p class="none">Nothing waits on you.</p>';
  return `<article class="card-top waiting${rows.length ? ' has' : ''}" data-w="before">
    <div class="ct-head"><button type="button" class="open state" aria-haspopup="dialog">Waiting on you</button><b class="count">${loading ? '–' : rows.length}</b></div>
    ${body}
    ${rows.length ? '<p class="foot">wait age from activity gate events · answering unblocks the next run</p>' : ''}
  </article>`;
};
