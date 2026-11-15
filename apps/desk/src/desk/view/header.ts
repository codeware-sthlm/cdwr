import type { TenantsPayload } from '../../supabase';
import { tenantsView } from '../../tenants/status';
import { plural } from '../format';
import type { Model } from '../model';
import type { Detail } from '../state';

import { countedRows, waitRows } from './waiting';

// What the header's Agent health pill and view switch count; they are drawn by components/status.tsx and view-switch.tsx.

/** What waits on you, as the Waiting on you card counts it; null until the queue's runs have loaded */
export const agentCount = (
  m: Model,
  details: ReadonlyMap<string, Detail>,
  now: Date
): number | null =>
  m.runs ? countedRows(waitRows(m, details, now)).length : null;

/** The open problems across the tenants and the shared host; `count` is null until the data has loaded, `stale` when the NUC stopped writing it */
export const platformCount = (
  data: TenantsPayload | null,
  now: Date
): { count: number | null; stale: boolean; empty: boolean } => {
  const v = tenantsView(data, now);
  return v.kind === 'ready'
    ? { count: v.problems.length, stale: v.stale, empty: false }
    : { count: null, stale: false, empty: v.kind === 'empty' };
};

export type Health = {
  /** The names of the checks that fail; a run problem counts as one */
  failing: string[];
  /** What runs behind main: the image, the desk, the install */
  updates: number;
  /** The queue is held by the plan's session limit: amber, not a failure */
  limited: boolean;
};

/** What the Agent health pill counts, from the health checks and what is behind main */
export const health = (m: Model): Health => ({
  failing: [
    ...m.health.filter((c) => !c.ok).map((c) => c.name),
    ...(m.runs && m.schedulerStale
      ? [`scheduler silent ${Math.floor(m.lastRunAge ?? 0)} h`]
      : []),
    ...(m.runProblems.length
      ? [plural(m.runProblems.length, 'run problem', 'run problems')]
      : [])
  ],
  updates:
    Number(m.imageBehind !== null) +
    Number(m.deskBehind !== null) +
    Number(m.installStale),
  limited: m.runLimited !== null
});
