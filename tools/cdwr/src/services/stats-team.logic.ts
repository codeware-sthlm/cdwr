/** Umami refuses a longer team name */
const TEAM_NAME_MAX = 50;

/** What a tenant's team needs, in the order it is done */
export type TeamStep = 'create-team' | 'move-website' | 'add-reader';

/** What the planner reads about a tenant's team */
export interface TenantTeamInput {
  /** The team the workspace records, `null` before it has one */
  statsTeamId: string | null;
  /** The workspace's website as Umami knows it, `null` when there is none */
  website: { id: string; teamId: string | null } | null;
  /** The user the read key acts as */
  reader: { id: string; role: string };
  /** Members of the team; empty while there is no team yet */
  teamUserIds: string[];
  /** The recorded team is not in Umami any more */
  teamMissing?: boolean;
}

export interface TenantTeamPlan {
  steps: TeamStep[];
  /** Moving a website out of another team needs an admin key */
  needsAdmin: boolean;
  /** Something a person has to fix; nothing is planned meanwhile */
  problem?: 'team-missing';
}

/** The tenant's team name in Umami */
export const teamName = (deployment: string): string =>
  `cdwr-${deployment}`.slice(0, TEAM_NAME_MAX);

/** What is missing for the tenant's own team, its website and its reader; no steps means ok */
export function planTenantTeam({
  statsTeamId,
  website,
  reader,
  teamUserIds,
  teamMissing
}: TenantTeamInput): TenantTeamPlan {
  if (statsTeamId && teamMissing)
    return { steps: [], needsAdmin: false, problem: 'team-missing' };
  const steps: TeamStep[] = [];
  if (!statsTeamId) steps.push('create-team');
  if (website && website.teamId !== statsTeamId) steps.push('move-website');
  // An admin reads every website without being a member
  if (reader.role !== 'admin' && !teamUserIds.includes(reader.id))
    steps.push('add-reader');
  return { steps, needsAdmin: steps.includes('move-website') };
}

/** Plan wording of each step */
export const TEAM_STEP_TEXT: Record<TeamStep, string> = {
  'create-team': 'create team',
  'move-website': 'move website',
  'add-reader': 'add reader'
};

/** The advice for a recorded team that Umami no longer has */
export const teamMissingAdvice = (teamId: string): string =>
  `team ${teamId} is gone from Umami; clear "Statistics team ID" in the admin and run again`;
