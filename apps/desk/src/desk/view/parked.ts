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

/** How long a wait on Copilot may go without the scheduler's request before it counts as stalled */
export const COPILOT_STALL_MIN = 5;

/**
 * Why a parked wait on Copilot has stalled, in a short sentence; null when it has not. It has when
 * Copilot was not asked for yet and the scheduler's request failed, or made none within five minutes
 */
export const copilotStall = (p: QueueParked, now: Date): string | null => {
  if (p.wait !== 'copilot' || p.resolved || p.copilot !== 'none') return null;
  if (p.copilotAsked)
    return p.copilotAsked.ok
      ? null
      : `Copilot request failed${p.copilotAsked.why ? ': ' + p.copilotAsked.why : ''}`;
  const since = p.since ? Date.parse(p.since) : NaN;
  return now.getTime() - since >= COPILOT_STALL_MIN * 6e4
    ? 'no Copilot request was made'
    : null;
};

/** "Review fixes: waits on CI since 17:20" for an open PR whose ticket is parked; empty otherwise */
export const prWaitPlain = (m: Pick<Model, 'prWaits'>, id: string): string => {
  const p = m.prWaits.get(id);
  if (!p) return '';
  return `Review fixes: ${parkedPlain(p)}${p.since && !p.resolved ? ' since ' + hhmm(Date.parse(p.since)) : ''}`;
};
