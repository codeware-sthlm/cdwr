import { defineCommand } from '../../cli/command';
import { messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { resolveDatabaseUrl, withDatabase } from '../../services/database';
import { environmentInput } from '../../services/environment';
import { listAccountUsers } from '../../services/stats-accounts';
import { requireAdmin } from '../../services/stats-team';
import { listTenantRows } from '../../services/tenant-rows';
import {
  getTeam,
  listTeamUsers,
  listTeams,
  listUsers,
  loginToken,
  readUmamiProvisioning,
  removeTeamUser,
  whoAmI
} from '../../services/umami';

import {
  type AccountsReport,
  type PruneOutcome,
  type TeamAccounts,
  accountsLine,
  findingLines,
  hasFindings,
  planAccounts,
  summarizeAccounts
} from './stats-accounts.logic';

interface PlanData {
  connection: { url: string; apiKey: string };
  report: AccountsReport;
  prune: boolean;
}

/**
 * Compares each statistics team's members with the admins of its workspace.
 * Read-only unless `--prune`, which removes the members no admin role backs.
 */
export default defineCommand<
  {
    environment: ReturnType<typeof environmentInput<readonly ['production']>>;
    prune: ReturnType<typeof input.boolean>;
  },
  PlanData
>({
  summary: "Compare the statistics teams' members with the workspace admins",
  description:
    'Lists every team member as ok, stale (no admin role behind it) or missing (an admin with an account who is not in the team), plus orphan teams and Umami accounts the cms has no id for. Read-only; --prune removes the stale members.',
  danger: 'read',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(['production'] as const),
    prune: input.boolean({
      prompt: 'Remove the stale members?',
      short: 'p',
      description:
        'Remove team members that no admin role of the workspace backs',
      default: false
    })
  },

  async plan(ctx, { environment, prune }) {
    const provisioning = await readUmamiProvisioning(environment);
    if (provisioning.status === 'unconfigured')
      throw new Error(
        `Umami is not configured in ${environment}; missing ${provisioning.missing.join(', ')}`
      );
    const connection = { url: provisioning.url, apiKey: provisioning.apiKey };
    const readerConnection = { ...connection, apiKey: provisioning.readApiKey };

    await requireAdmin(connection);

    const { adminLogin } = provisioning;
    if (!adminLogin)
      ctx.ui.info(
        'Skipping the unlinked-users check: UMAMI_ADMIN_USERNAME and UMAMI_ADMIN_PASSWORD are not set in /integrations/umami'
      );

    const databaseUrl = await resolveDatabaseUrl(environment, undefined);
    const { rows, users } = await ctx.ui.task(
      'Reading workspaces and users from Payload',
      () =>
        withDatabase(databaseUrl, async (url) => ({
          rows: await listTenantRows(ctx.root, environment, url),
          users: await listAccountUsers(ctx.root, environment, url)
        })),
      ({ rows, users }) =>
        `${rows.length} workspace(s), ${users.length} user(s) found`
    );

    const { report, names } = await ctx.ui.task(
      'Reading the teams in Umami',
      async () => {
        const [me, reader, umamiUsers, umamiTeams] = await Promise.all([
          whoAmI(connection),
          whoAmI(readerConnection),
          adminLogin
            ? loginToken(
                connection.url,
                adminLogin.username,
                adminLogin.password
              ).then((token) => listUsers(connection, token))
            : Promise.resolve([]),
          listTeams(connection)
        ]);
        const teams: TeamAccounts[] = await Promise.all(
          rows.flatMap((row) =>
            row.statsTeamId
              ? [
                  (async (teamId: string): Promise<TeamAccounts> => ({
                    deployment: row.deployment ?? row.slug,
                    tenantId: row.id,
                    teamId,
                    members: (await getTeam(connection, teamId))
                      ? (await listTeamUsers(connection, teamId)).map(
                          ({ userId }) => userId
                        )
                      : null
                  }))(row.statsTeamId)
                ]
              : []
          )
        );
        return {
          report: planAccounts({
            teams,
            users,
            umamiUsers,
            umamiTeams,
            ignored: [me.id, reader.id]
          }),
          names: new Map(umamiUsers.map(({ id, username }) => [id, username]))
        };
      },
      ({ report }) => `${report.teams.length} team(s) read`
    );

    const label = (userId: string) => names.get(userId) ?? userId;
    return {
      steps: [
        ...report.teams.map((team) => accountsLine(team, label)),
        ...findingLines(report)
      ],
      target: { environment, name: 'umami' },
      ...(prune ? { danger: 'destructive' as const } : {}),
      ...(hasFindings(report)
        ? {}
        : { nothing: 'Every statistics account is in order' }),
      data: { connection, report, prune }
    };
  },

  async apply(ctx, { connection, report, prune }) {
    if (!prune) {
      const stale = report.teams.some(({ stale }) => stale.length > 0);
      return {
        summary: summarizeAccounts(report, null),
        next: stale ? ['Run with `--prune` to remove the stale members.'] : [],
        json: { report }
      };
    }

    const outcomes: PruneOutcome[] = [];
    for (const { deployment, teamId, stale } of report.teams) {
      if (!stale.length) continue;
      const removed: string[] = [];
      try {
        await ctx.ui.task(
          `Pruning the team of ${deployment}`,
          async () => {
            for (const userId of stale) {
              await removeTeamUser(connection, teamId, userId);
              removed.push(userId);
            }
          },
          () => `${removed.length} removed`
        );
        outcomes.push({ deployment, teamId, removed });
      } catch (error) {
        const message = messageOf(error);
        ctx.ui.warn(`${deployment}: ${message}`);
        outcomes.push({ deployment, teamId, removed, error: message });
      }
    }

    const failed = outcomes.some(({ error }) => error);
    return {
      summary: summarizeAccounts(report, outcomes),
      partial: failed,
      next: failed
        ? ['Run `cdwr tenant stats-accounts --prune` again.']
        : undefined,
      json: { report, outcomes }
    };
  }
});
