import type { AccountUser } from '../../services/stats-accounts';

/** What the planner reads about one workspace's team */
export interface TeamAccounts {
  deployment: string;
  tenantId: number;
  teamId: string;
  /** Umami user ids in the team; `null` when the team is gone from Umami */
  members: string[] | null;
}

export interface AccountsInput {
  teams: ReadonlyArray<TeamAccounts>;
  users: ReadonlyArray<AccountUser>;
  /** Every Umami user */
  umamiUsers: ReadonlyArray<{ id: string; username: string }>;
  /** Every Umami team, with the ids the workspaces record */
  umamiTeams: ReadonlyArray<{ id: string; name: string }>;
  /** Umami users that are members for other reasons: the read key and the provisioning user */
  ignored: ReadonlyArray<string>;
}

export interface TeamReport {
  deployment: string;
  teamId: string;
  gone: boolean;
  /** Members backed by an admin of the workspace */
  ok: string[];
  /** Members with no admin role behind them; `--prune` removes them */
  stale: string[];
  /** Admins with an account who are not in the team; the next sheet action adds them */
  missing: string[];
}

export interface AccountsReport {
  teams: TeamReport[];
  /** Teams named like ours whose workspace no longer records them */
  orphans: Array<{ id: string; name: string }>;
  /** Umami users named like a cms admin that the cms has no id for */
  unlinked: Array<{ id: string; username: string }>;
}

/** The prefix every team made by `stats-teams` carries */
const TEAM_PREFIX = 'cdwr-';

const sorted = (list: Iterable<string>) => [...list].sort();

/** Compare each team's members with the admins of its workspace */
export function planAccounts({
  teams,
  users,
  umamiUsers,
  umamiTeams,
  ignored
}: AccountsInput): AccountsReport {
  const skip = new Set(ignored);
  const adminsOf = (tenantId: number) =>
    new Set(
      users.flatMap(({ umamiUserId, tenants }) =>
        umamiUserId &&
        tenants.some((row) => row.tenantId === tenantId && row.role === 'admin')
          ? [umamiUserId]
          : []
      )
    );

  const reports = teams.map(
    ({ deployment, tenantId, teamId, members }): TeamReport => {
      if (members === null)
        return {
          deployment,
          teamId,
          gone: true,
          ok: [],
          stale: [],
          missing: []
        };
      const admins = adminsOf(tenantId);
      const present = new Set(members.filter((id) => !skip.has(id)));
      return {
        deployment,
        teamId,
        gone: false,
        ok: sorted([...present].filter((id) => admins.has(id))),
        stale: sorted([...present].filter((id) => !admins.has(id))),
        missing: sorted([...admins].filter((id) => !present.has(id)))
      };
    }
  );

  const recorded = new Set(teams.map(({ teamId }) => teamId));
  const orphans = umamiTeams
    .filter(({ id, name }) => name.startsWith(TEAM_PREFIX) && !recorded.has(id))
    .map(({ id, name }) => ({ id, name }));

  const unlinkedEmails = new Set(
    users.flatMap(({ email, umamiUserId, tenants }) =>
      !umamiUserId && tenants.some(({ role }) => role === 'admin')
        ? [email.toLowerCase()]
        : []
    )
  );
  const unlinked = umamiUsers
    .filter(
      ({ id, username }) =>
        !skip.has(id) && unlinkedEmails.has(username.toLowerCase())
    )
    .map(({ id, username }) => ({ id, username }));

  return { teams: reports, orphans, unlinked };
}

/** The plan line for a workspace; `label` names a user id */
export function accountsLine(
  { deployment, teamId, gone, ok, stale, missing }: TeamReport,
  label: (userId: string) => string
): string {
  if (gone) return `${deployment}  team ${teamId} is gone from Umami`;
  const parts = [
    ...(ok.length ? [`${ok.length} ok`] : []),
    ...(stale.length ? [`stale ${stale.map(label).join(', ')}`] : []),
    ...(missing.length ? [`missing ${missing.map(label).join(', ')}`] : [])
  ];
  return `${deployment}  ${parts.length ? parts.join(' · ') : 'ok'}`;
}

/** Report-only findings, one line each */
export function findingLines({ orphans, unlinked }: AccountsReport): string[] {
  return [
    ...orphans.map(
      ({ id, name }) => `orphan team ${name} (${id}): no workspace records it`
    ),
    ...unlinked.map(
      ({ username }) =>
        `unlinked account ${username}: in Umami, but the cms has no id for it`
    )
  ];
}

/** Whether there is anything to say beyond "in order" */
export const hasFindings = (report: AccountsReport): boolean =>
  report.orphans.length > 0 ||
  report.unlinked.length > 0 ||
  report.teams.some(
    ({ gone, stale, missing }) => gone || stale.length > 0 || missing.length > 0
  );

export interface PruneOutcome {
  deployment: string;
  teamId: string;
  removed: string[];
  error?: string;
}

/** The closing summary of a run; `outcomes` is null for a read-only run */
export function summarizeAccounts(
  report: AccountsReport,
  outcomes: ReadonlyArray<PruneOutcome> | null
): string {
  const stale = report.teams.reduce((sum, { stale }) => sum + stale.length, 0);
  const missing = report.teams.reduce(
    (sum, { missing }) => sum + missing.length,
    0
  );
  const rest = `${missing} missing, ${report.orphans.length} orphan team(s), ${report.unlinked.length} unlinked`;
  if (!outcomes) return `${stale} stale, ${rest}`;
  const removed = outcomes.reduce(
    (sum, { removed }) => sum + removed.length,
    0
  );
  const failed = outcomes.filter(({ error }) => error).length;
  return `${removed} removed, ${failed} team(s) failed, ${rest}`;
}
