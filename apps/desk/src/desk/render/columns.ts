import { esc, hhmm, inline, plural } from '../format';
import { type Model, prOf } from '../model';
import type { DeskState } from '../state';
import type { PrRef, QueueNext, SessionState } from '../types';

import {
  idLink,
  parkedText,
  prn,
  reasonChip,
  side,
  tLink,
  titled
} from './html';

// The three columns of the main view: before the agent can build, the agent, after the agent built

const ROWS = 5; // rows a column shows before "+ n more"; keeps the main view on one screen

const WHY: ReadonlyMap<string, string> = new Map([
  ['answered', 'Your reply is in.'],
  ['review feedback', 'Its PR has review comments to address.'],
  ['take over', 'Its claim went stale.'],
  ['resume', ''],
  ['ready', '']
]);

const nextAt = (m: Pick<Model, 'nextRun'>): string =>
  m.nextRun ? hhmm(m.nextRun) : 'its next run';

/** "merge #617 (COD-566) first", or a blocker without a PR yet; empty when nothing holds the PR back */
export const blockedText = (m: Pick<Model, 'prBlockers'>, id: string): string =>
  (m.prBlockers.get(id) || [])
    .map((b) =>
      b.pr
        ? `merge ${prn(b.pr)} (${idLink(b.ticket)}) first`
        : `${idLink(b.ticket)} has no PR yet`
    )
    .join('; ');

/** Who takes a queued item and when: the live session, or the scheduler on its next run */
export const whyLine = (m: Model, x: QueueNext): string => {
  const s: SessionState = m.session ?? { state: 'none' };
  const live = s.state === 'alive' || s.state === 'waiting';
  const who =
    m.stuck !== null
      ? 'The live session should have taken it; it is stuck polling.'
      : live
        ? s.ticket === x.ticket
          ? 'The live session is on it.'
          : 'The live session takes it after its current step.'
        : x.reason === 'ready'
          ? `The scheduler plans it at ${nextAt(m)}.`
          : `The scheduler starts a session for it at ${nextAt(m)}.`;
  return [
    (x.reason !== undefined && WHY.get(x.reason)) || '',
    who,
    x.detail ? inline(x.detail) : ''
  ]
    .filter(Boolean)
    .join(' ');
};

const rowsHTML = (items: readonly string[], none: string): string => {
  if (!items.length) return `<p class="none">${none}</p>`;
  const shown = items.slice(0, ROWS);
  return `<ul class="rows">${shown.join('')}${items.length > ROWS ? `<li class="more-line">+ ${items.length - ROWS} more</li>` : ''}</ul>`;
};

const groupedRows = (
  groups: readonly { label: string; items: readonly string[] }[],
  none: string
): string => {
  const live = groups.filter((g) => g.items.length);
  if (!live.length) return `<p class="none">${none}</p>`;
  const out: string[] = [];
  let left = ROWS,
    hidden = 0;
  for (const g of live) {
    const shown = g.items.slice(0, Math.max(0, left));
    hidden += g.items.length - shown.length;
    if (!shown.length) continue;
    if (live.length > 1)
      out.push(`<li class="grp">${esc(g.label)} · ${g.items.length}</li>`);
    out.push(...shown);
    left -= shown.length;
  }
  return `<ul class="rows">${out.join('')}${hidden ? `<li class="more-line">+ ${hidden} more</li>` : ''}</ul>`;
};

const colHTML = (
  k: string,
  title: string,
  count: string | number,
  body: string
): string =>
  `<div class="col-head"><span class="k">${k}</span><button type="button" class="open" aria-haspopup="dialog">${esc(title)}</button><span class="count">${count}</span></div>${body}`;

export type Columns = {
  /** Whether something waits on the viewer, which lights the first column */
  waiting: boolean;
  before: string;
  next: string;
  after: string;
};

export const renderColumns = (m: Model, state: DeskState): Columns => {
  const loading = !m.runs;
  const prFor = (id: string, known?: PrRef | null): PrRef | null =>
    prOf(state.details, id, known);

  const before = [
    ...m.before.map((x) => {
      const kind = x.kind === 'plan' ? 'plan' : 'question';
      return `<li>${titled(m, x.ticket)}<span class="chip ${kind}">${kind}</span></li>`;
    }),
    ...m.toLabel.map(
      (x) =>
        `<li>${titled(m, x.ticket)}<span class="chip label">ready to label</span>${x.parent ? `<span class="s">${esc(x.parent)}</span>` : ''}</li>`
    ),
    ...m.ideasPending.map(
      (i) =>
        `<li>${tLink(i)}<span class="chip idea">idea</span><span class="s">Accept with <code>agent:ready</code>, or cancel with one word</span></li>`
    )
  ];

  const next = [
    ...m.next.map(
      (x) =>
        `<li>${titled(m, x.ticket)}${side(prFor(x.ticket), reasonChip(x.reason))}<span class="s">${whyLine(m, x)}</span></li>`
    ),
    ...m.parked.map(
      (p) =>
        `<li>${titled(m, p.ticket)}${side(prFor(p.ticket, p.pr), '<span class="chip parked">parked</span>')}<span class="s">${parkedText(p)}${p.since ? ' since ' + hhmm(Date.parse(p.since)) : ''}${p.resolved ? '' : '. It resumes when that finishes.'}</span></li>`
    ),
    ...(m.held.tickets.length
      ? [
          `<li><span class="t">${m.held.tickets.map(esc).join(', ')}</span><span class="chip held">held</span><span class="s">The limit holds ${plural(m.held.tickets.length, 'ready ticket', 'ready tickets')}; review an open PR to free a slot</span></li>`
        ]
      : [])
  ];

  const open = m.prs.map((x) => {
    const held = blockedText(m, x.ticket);
    return `<li>${titled(m, x.ticket)}${side(prFor(x.ticket, x.pr), held ? '<span class="chip blocked">merge later</span>' : '<span class="chip pr">review</span>')}${held ? `<span class="s">${held}</span>` : ''}</li>`;
  });
  const merged = m.handoffs.map(
    (x) =>
      `<li>${titled(m, x.ticket)}${side(prFor(x.ticket), `<span class="chip handoffs">${plural(x.items?.length || 0, 'check', 'checks')}</span>`)}${x.items?.[0] ? `<span class="s">${inline(x.items[0])}</span>` : ''}</li>`
  );

  return {
    waiting: before.length > 0,
    before: colHTML(
      'Before the agent can build',
      'Waiting on you',
      loading ? '–' : before.length,
      loading
        ? `<p class="none">Loading…</p>`
        : rowsHTML(before, 'No plan, question, label or idea waits for you.')
    ),
    next: colHTML(
      'The agent',
      'Takes next',
      loading ? '–' : m.next.length,
      loading
        ? `<p class="none">Loading…</p>`
        : rowsHTML(
            next,
            'Nothing to take. Add <code>agent:ready</code> to a ticket in Linear.'
          )
    ),
    after: colHTML(
      'After the agent built',
      'Review and check',
      loading ? '–' : m.prs.length + m.handoffItems,
      loading
        ? `<p class="none">Loading…</p>`
        : groupedRows(
            [
              { label: 'Open PRs', items: open },
              { label: 'Merged, hand-offs left', items: merged }
            ],
            'No PR to review and no hand-off left.'
          )
    )
  };
};
