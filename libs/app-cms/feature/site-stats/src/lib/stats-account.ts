import type { UmamiTeamRole, UmamiUserRole } from './umami-admin-client';

/** What a statistics login may do in Umami: no websites or teams of its own */
export const STATS_USER_ROLE = 'view-only' satisfies UmamiUserRole;

/** What a statistics login may do in its workspace's team */
export const STATS_TEAM_ROLE = 'team-view-only' satisfies UmamiTeamRole;

/**
 * Whether the caller can get a statistics login: `none` when not allowed,
 * `available` when they can ask for one, `ready` when they have one.
 */
export type StatsAccountState = 'none' | 'available' | 'ready';
