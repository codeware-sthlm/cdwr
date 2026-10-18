import {
  TEAM_STEP_TEXT,
  type TeamStep,
  teamMissingAdvice
} from '../../services/stats-team.logic';

/** How one workspace came out */
export interface TeamOutcome {
  deployment: string;
  steps: TeamStep[];
  status: 'ok' | 'done' | 'failed';
  error?: string;
}

/** The plan line for a workspace; no steps means its team is in order */
export const teamLine = (
  deployment: string,
  steps: ReadonlyArray<TeamStep>
): string =>
  `${deployment}  ${steps.length ? steps.map((step) => TEAM_STEP_TEXT[step]).join(' · ') : 'ok'}`;

/** The plan line for a workspace whose plan could not be made */
export const problemLine = (
  deployment: string,
  problem: { teamId: string } | { error: string }
): string =>
  `${deployment}  ${'error' in problem ? `could not read: ${problem.error}` : teamMissingAdvice(problem.teamId)}`;

/** The closing summary, counting each outcome */
export function summarizeTeams(outcomes: ReadonlyArray<TeamOutcome>): string {
  const count = (status: TeamOutcome['status']) =>
    outcomes.filter((outcome) => outcome.status === status).length;
  return `${count('done')} done, ${count('ok')} ok, ${count('failed')} failed`;
}
