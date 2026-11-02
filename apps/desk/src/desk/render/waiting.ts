import { esc, shortAge } from '../format';
import { type Blocker, type Model, prOf } from '../model';
import type { Detail } from '../state';
import type { PrRef } from '../types';

import { livePr, prTone, prWaitText, prn, queuePr } from './html';

// The Waiting on you card: everything that waits on you, furthest along first, each with how long it has waited

/** Rows the phone shows before "+ n more — open all"; the desktop shows every row */
export const PHONE_ROWS = 2;

export type WaitRow = {
  id: string;
  title: string;
  url: string;
  kind:
    | 'review'
    | 'hand-offs'
    | 'question'
    | 'plan'
    | 'ready to label'
    | 'idea'
    | 'approved';
  /** The ticket's pull request; null without one, and always for an idea */
  pr: PrRef | null;
  /** Minutes waited; null without activity to tell */
  age: number | null;
  /** Open hand-off items; null for any other kind */
  count: number | null;
  /** The open blockers as "COD-693 · PR 755, COD-700"; empty when none */
  blockers: string;
  /** HTML note on a PR parked on review fixes; empty otherwise */
  wait: string;
};

/** Open blockers as text: the ticket, with its PR when it has one */
export const blockerText = (bs: readonly Blocker[]): string =>
  bs.map((b) => (b.pr ? `${b.ticket} · PR ${b.pr}` : b.ticket)).join(', ');

/** The kind as the row shows it */
export const rowLabel = (r: WaitRow): string =>
  r.kind === 'approved'
    ? `approved · waits on ${r.blockers}`
    : r.kind === 'hand-offs'
      ? `hand-offs · ${r.count ?? 0}`
      : r.kind;

/** What waits on you, furthest along first: PRs to review, hand-offs, questions, plans, tickets to label, ideas; approved plans held by a blocker come last */
export const waitRows = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): WaitRow[] => {
  const row = (
    id: string,
    kind: WaitRow['kind'],
    opts: { blockers?: readonly Blocker[]; count?: number } = {}
  ): WaitRow => {
    const { title, url } = m.get(id);
    return {
      id,
      title,
      url,
      kind,
      pr: prOf(details, id, queuePr(m, id)),
      age: m.waitAge.get(id) ?? null,
      count: opts.count ?? null,
      blockers: blockerText(opts.blockers ?? []),
      wait: prWaitText(m, id)
    };
  };
  const open = (id: string): readonly Blocker[] => m.blockers.get(id) ?? [];
  const before = (kind: 'plan' | 'question') =>
    m.before
      .filter((x) => (x.kind === 'plan' ? 'plan' : 'question') === kind)
      .map((x) => row(x.ticket, kind, { blockers: open(x.ticket) }));
  return [
    ...m.prs.map((x) => row(x.ticket, 'review', { blockers: open(x.ticket) })),
    ...m.handoffs.map((x) =>
      row(x.ticket, 'hand-offs', { count: x.items?.length ?? 0 })
    ),
    ...before('question'),
    ...before('plan'),
    ...m.toLabel.map((x) => row(x.ticket, 'ready to label')),
    ...m.ideasPending.map((i): WaitRow => ({
      id: i.id,
      title: i.title,
      url: i.url,
      kind: 'idea',
      pr: null,
      age: i.createdAt ? (now.getTime() - Date.parse(i.createdAt)) / 6e4 : null,
      count: null,
      blockers: '',
      wait: ''
    })),
    ...m.heldApprovals.map((h) =>
      row(h.ticket, 'approved', { blockers: h.blockers })
    )
  ];
};

/** The rows that count toward the card's badge; approved rows only wait on a blocker */
export const countedRows = (rows: readonly WaitRow[]): WaitRow[] =>
  rows.filter((r) => r.kind !== 'approved');

const rowHTML =
  (m: Model, details: ReadonlyMap<string, Detail>) =>
  (r: WaitRow): string => {
    const tone = prTone(
      livePr(m, details, { ticket: r.id, pr: r.pr }).live?.state ?? null
    );
    const approved = r.kind === 'approved';
    const note = [
      !approved && r.blockers ? esc('after ' + r.blockers) : '',
      r.wait
    ]
      .filter(Boolean)
      .join(' · ');
    return `<li class="wrow-li${approved ? ' approved' : ''}"><a class="wrow" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="id">${esc(r.id)}</span><span class="t">${esc(r.title)}</span><span class="kind">${esc(rowLabel(r))}</span>${r.age === null ? '' : `<time>${esc(shortAge(r.age))}</time>`}</a>${prn(r.pr, tone)}${note ? `<span class="wnote">${note}</span>` : ''}</li>`;
  };

export const renderWaiting = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): string => {
  const loading = !m.runs;
  const rows = loading ? [] : waitRows(m, details, now);
  const count = countedRows(rows).length;
  const hidden = rows.length - PHONE_ROWS;
  const body = loading
    ? '<p class="none">Loading…</p>'
    : rows.length
      ? `<ul class="wrows">${rows.map(rowHTML(m, details)).join('')}</ul>${hidden > 0 ? `<button type="button" class="more-all" aria-haspopup="dialog">+ ${hidden} more — open all</button>` : ''}`
      : '<p class="none">Nothing waits on you.</p>';
  return `<article class="card-top waiting${count ? ' has' : ''}" data-w="before">
    <div class="ct-head"><button type="button" class="open state" aria-haspopup="dialog">Waiting on you</button><b class="count">${loading ? '–' : count}</b></div>
    ${body}
    ${rows.length ? '<p class="foot">wait age from activity gate events · answering unblocks the next run</p>' : ''}
  </article>`;
};
