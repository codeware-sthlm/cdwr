import { waitName } from '../constants';
import { hhmm } from '../format';
import type { Model } from '../model';
import type { QueueParked } from '../types';

// What a parked ticket waits on, as plain text

/** What a parked ticket waits on, or what it waited on and how that went, as plain text */
export const parkedPlain = (p: QueueParked): string =>
  p.resolved
    ? `${waitName(p.wait) || p.wait} ${p.outcome || 'done'}, resumes next`
    : `waits on ${waitName(p.wait) || p.wait}`;

/** "Review fixes: waits on CI since 17:20" for an open PR whose ticket is parked; empty otherwise */
export const prWaitPlain = (m: Pick<Model, 'prWaits'>, id: string): string => {
  const p = m.prWaits.get(id);
  if (!p) return '';
  return `Review fixes: ${parkedPlain(p)}${p.since && !p.resolved ? ' since ' + hhmm(Date.parse(p.since)) : ''}`;
};
