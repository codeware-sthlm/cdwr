import type { Model } from '../model';
import type { DeskState } from '../state';
import type { QueueTreeNode } from '../types';

import { canonicalId, isTicketId } from './ids';

// The header search: which tickets a query finds among everything the desk holds, and where each one shows up

/** The places a ticket shows up, in the order `SearchHit.where` lists them */
export const SEARCH_PLACES = [
  'open',
  'closed',
  'idea',
  'tree',
  'gap',
  'next',
  'parked',
  'review',
  'label',
  'session'
] as const;

export type SearchPlace = (typeof SEARCH_PLACES)[number];

/** The most hits a search returns */
export const SEARCH_MAX = 20;

export type SearchHit = {
  ticket: string;
  title: string;
  /** The places the ticket shows up, in `SEARCH_PLACES` order */
  where: SearchPlace[];
};

const numberOf = (id: string): number =>
  Number(id.slice(id.lastIndexOf('-') + 1));

const treeNodes = (tree: readonly QueueTreeNode[]): QueueTreeNode[] =>
  tree.flatMap((root) => [root, ...treeNodes(root.children)]);

/** Every ticket id the desk holds, each with the places it shows up and the best title any of them carries */
const collect = (
  m: Model,
  state: DeskState
): Map<string, { places: Set<SearchPlace>; title: string }> => {
  const found = new Map<string, { places: Set<SearchPlace>; title: string }>();
  const add = (id: string, place: SearchPlace, title = ''): void => {
    if (!isTicketId(id)) return;
    const entry = found.get(id) ?? { places: new Set(), title: '' };
    entry.places.add(place);
    entry.title ||= title;
    found.set(id, entry);
  };
  for (const i of m.all) add(i.id, 'open', i.title);
  for (const i of state.data.closed ?? []) add(i.id, 'closed', i.title);
  for (const i of state.data.ideas ?? []) add(i.id, 'idea', i.title);
  for (const n of treeNodes(m.tree)) add(n.ticket, 'tree', n.title ?? '');
  for (const g of m.gaps) add(g.ticket, 'gap', g.title);
  for (const x of m.next) add(x.ticket, 'next');
  for (const x of m.parked) add(x.ticket, 'parked');
  for (const x of m.prs) add(x.ticket, 'review');
  for (const x of m.toLabel) add(x.ticket, 'label');
  const s = m.session;
  if (s?.ticket && s.state !== 'ended') add(s.ticket, 'session');
  // The Linear issue's title outranks the others
  for (const [id, entry] of found) entry.title = m.get(id).title || entry.title;
  return found;
};

/**
 * The tickets a query finds, best first: the exact id (`797`, `cod-797`, `COD-797`), then ids
 * that start with it (`79` finds COD-79 and COD-790 to COD-799), then titles that hold every
 * word of the query, case-insensitive. Within a group the higher ticket number comes first.
 * At most SEARCH_MAX hits; an empty query finds nothing.
 */
export const searchTickets = (
  m: Model,
  state: DeskState,
  query: string
): SearchHit[] => {
  const q = query.trim();
  if (!q) return [];
  const id = canonicalId(q);
  const digits = id === null ? null : id.slice(id.indexOf('-') + 1);
  const words = q.toLowerCase().split(/\s+/);
  const rank = (ticket: string, title: string): number => {
    if (id !== null && ticket === id) return 0;
    if (digits !== null && String(numberOf(ticket)).startsWith(digits))
      return 1;
    const lower = title.toLowerCase();
    return words.every((w) => lower.includes(w)) ? 2 : 3;
  };
  return [...collect(m, state)]
    .map(([ticket, { places, title }]) => ({
      ticket,
      title,
      where: SEARCH_PLACES.filter((p) => places.has(p)),
      rank: rank(ticket, title)
    }))
    .filter((h) => h.rank < 3)
    .sort((a, b) => a.rank - b.rank || numberOf(b.ticket) - numberOf(a.ticket))
    .slice(0, SEARCH_MAX)
    .map(({ ticket, title, where }) => ({ ticket, title, where }));
};
