import { LIMIT, LINEAR_ISSUE, waitName } from '../constants';
import { esc } from '../format';
import type { Model } from '../model';
import type { JobHost, PrRef, QueueParked } from '../types';

// Shared HTML pieces: icons, links, chips. Every value is escaped here, unless the caller says it is HTML.

export const GH_PR = 'https://github.com/codeware-sthlm/cdwr/pull/';

const ICON = {
  plan: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  question:
    '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  review:
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>',
  handoff:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
  load: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  working:
    '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.9 4.9l2.9 2.9"/><path d="M16.2 16.2l2.9 2.9"/><path d="M2 12h4"/><path d="M18 12h4"/>',
  answered:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10l2 2 4-4"/>',
  next: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  blocked: '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>',
  sched: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.5 2.5 0 0 0-2.3-1.5h-1a2.3 2.3 0 0 0 0 4.5h1a2.3 2.3 0 0 1 0 4.5h-1A2.5 2.5 0 0 1 9.2 15"/><path d="M12 6v1.5"/><path d="M12 16.5V18"/>',
  ticket:
    '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  bars: '<path d="M3 21h18"/><path d="M7 21V11"/><path d="M12 21V5"/><path d="M17 21v-7"/>',
  timer:
    '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  chip: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
  all: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
} as const;

export type IconName = keyof typeof ICON;

export const icon = (name: IconName): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/** A chip; `html` is already HTML */
export const chip = (kind: string, html: string): string =>
  `<span class="chip ${kind}">${html}</span>`;

export const empty = (html: string): string =>
  `<div class="empty">${html}</div>`;

/** "+ 3 more" under a preview; nothing when all fit */
export const pvMore = (n: number): string =>
  n > 0 ? `<p class="pv-more">+ ${n} more</p>` : '';

/** The pull request's number as a link; nothing without one */
export const prn = (n: PrRef | null | undefined): string =>
  n
    ? `<a class="prn" href="${GH_PR + n}" target="_blank" rel="noopener" title="Pull request ${esc(n)}">#${esc(n)}</a>`
    : '';

/** The pull request as a plain id link */
export const pr = (n: PrRef | null | undefined): string =>
  n
    ? `<a class="id" href="${GH_PR + n}" target="_blank" rel="noopener">#${esc(n)}</a>`
    : '';

export const idLink = (id: string): string =>
  `<a class="id" href="${LINEAR_ISSUE + esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`;

/** A ticket's id and title as a link */
export const tLink = (i: { id: string; title: string; url: string }): string =>
  `<a class="t" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>`;

const SESSION: ReadonlyMap<string, string> = new Map([
  ['alive', 'Session live'],
  ['waiting', 'Session waits on you'],
  ['stopped', 'Session stopped'],
  ['none', 'No session']
]);

/** The session pill's label; a state the page does not list shows as it is */
export const sessionLabel = (state: string): string =>
  SESSION.get(state) ?? state;

const HOST: Record<JobHost, string> = {
  container: 'Container',
  launchd: 'Mac · launchd'
};

export const hostName = (host: JobHost): string => HOST[host];

// The chip text and class of why a ticket is queued
const REASON: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['resume', ['resume', 'resume']],
  ['take over', ['take over', 'takeover']],
  ['answered', ['answered', 'answered']],
  ['review feedback', ['review feedback', 'feedback']],
  ['ready', ['ready', 'ready']]
]);

export const reasonChip = (reason: string | undefined): string => {
  const [text, kind] = (reason !== undefined && REASON.get(reason)) || [
    reason,
    'resume'
  ];
  return chip(kind, esc(text));
};

/** What a parked ticket waits on, or what it waited on and how that went */
export const parkedText = (p: QueueParked): string =>
  p.resolved
    ? `${waitName(p.wait) || esc(p.wait)} ${esc(p.outcome || 'done')}, resumes next`
    : `waits on ${waitName(p.wait) || esc(p.wait)}`;

/** The meter under the limit: green, then amber one below the limit, then red */
export const loadMeter = (m: Pick<Model, 'limit'>): string => {
  const n = m.limit.used,
    max = m.limit.max || LIMIT;
  return `<div class="meter" aria-hidden="true"><i style="width:${Math.min(100, (n / max) * 100)}%;background:var(${n >= max ? '--block' : n >= max - 1 ? '--wait' : '--ok'})"></i></div>`;
};
