export type IdleWorkspaceInput = {
  id: number | string;
  name: string;
  status: 'pending' | 'active';
  createdAt: string;
  idleWarnedAt?: string | null;
  statsTeamId?: string | null;
  statsWebsiteId?: string | null;
  hasPages: boolean;
};

export type IdleDecision =
  | { action: 'none' }
  | { action: 'warn'; deleteOn: Date }
  | { action: 'delete' }
  | { action: 'report'; reason: 'provisioned' };

/** Days of notice between the warning and the deletion. */
export const WARNING_LEAD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The nightly run drifts by seconds; a threshold is met this much early */
export const SCHEDULE_SLACK_MS = 60 * 60 * 1000;

/** Whether at least `days` days have passed since `from`, give or take the slack */
const hasElapsed = (from: string, days: number, now: Date) =>
  now.getTime() - new Date(from).getTime() >= days * DAY_MS - SCHEDULE_SLACK_MS;

/**
 * Decides what the nightly cleanup does with a workspace that was created by
 * self-serve signup. Only pending workspaces without pages are ever touched,
 * and one with provisioning traces is reported rather than deleted.
 */
export function decideIdleWorkspace(
  t: IdleWorkspaceInput,
  idleDays: number,
  now: Date
): IdleDecision {
  if (t.status !== 'pending' || t.hasPages) {
    return { action: 'none' };
  }

  if (!hasElapsed(t.createdAt, idleDays - WARNING_LEAD_DAYS, now)) {
    return { action: 'none' };
  }

  // Reported once; the task marks it so the next night stays quiet
  if (t.statsTeamId || t.statsWebsiteId) {
    return t.idleWarnedAt
      ? { action: 'none' }
      : { action: 'report', reason: 'provisioned' };
  }

  if (!t.idleWarnedAt) {
    // A late-enabled setting still gives a full week of notice
    const deleteOn = new Date(
      Math.max(
        new Date(t.createdAt).getTime() + idleDays * DAY_MS,
        now.getTime() + WARNING_LEAD_DAYS * DAY_MS
      )
    );
    return { action: 'warn', deleteOn };
  }

  return hasElapsed(t.createdAt, idleDays, now) &&
    hasElapsed(t.idleWarnedAt, WARNING_LEAD_DAYS, now)
    ? { action: 'delete' }
    : { action: 'none' };
}
