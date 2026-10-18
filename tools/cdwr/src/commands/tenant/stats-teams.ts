import { defineCommand } from '../../cli/command';
import { messageOf } from '../../cli/errors';
import { resolveDatabaseUrl, withDatabase } from '../../services/database';
import { environmentInput } from '../../services/environment';
import {
  applyTenantTeam,
  gatherTenantTeam,
  recordTeamId,
  requireAdmin
} from '../../services/stats-team';
import {
  type TenantTeamInput,
  type TenantTeamPlan,
  planTenantTeam,
  teamMissingAdvice
} from '../../services/stats-team.logic';
import { listTenantRows } from '../../services/tenant-rows';
import { readUmamiProvisioning } from '../../services/umami';

import {
  type TeamOutcome,
  problemLine,
  summarizeTeams,
  teamLine
} from './stats-teams.logic';

/** A workspace read and planned, or one that needs a person first */
type TeamWork =
  | {
      tenant: { id: number; deployment: string };
      input: TenantTeamInput;
      plan: TenantTeamPlan;
    }
  | {
      tenant: { id: number; deployment: string };
      problem: { teamId: string } | { error: string };
      error: string;
    };

/**
 * Brings every workspace with a statistics website into its own Umami team:
 * the team, the website inside it and the read key as a view-only member.
 * Idempotent, so it doubles as the repair after a half-finished run.
 */
export default defineCommand({
  summary: "Give each workspace's statistics website its own Umami team",
  description:
    'Creates a team per workspace, moves its website into it and lets the read key view it. Needs an admin PROVISION_API_KEY; safe to rerun.',
  danger: 'mutate',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(['production'] as const)
  },

  async plan(ctx, { environment }) {
    const provisioning = await readUmamiProvisioning(environment);
    if (provisioning.status === 'unconfigured')
      throw new Error(
        `Umami is not configured in ${environment}; missing ${provisioning.missing.join(', ')}`
      );
    const connection = {
      url: provisioning.url,
      apiKey: provisioning.apiKey
    };
    const readerConnection = { ...connection, apiKey: provisioning.readApiKey };

    // Up front, also on a dry run: a plan that cannot be applied says so now
    await requireAdmin(connection);

    const databaseUrl = await resolveDatabaseUrl(environment, undefined);
    const rows = await ctx.ui.task(
      'Reading workspaces from Payload',
      () =>
        withDatabase(databaseUrl, (url) =>
          listTenantRows(ctx.root, environment, url)
        ),
      (list) => `${list.length} workspace(s) found`
    );
    const tenants = rows.flatMap((row) =>
      row.statsWebsiteId && row.deployment
        ? [{ ...row, deployment: row.deployment }]
        : []
    );

    const work = await ctx.ui.task(
      'Reading the teams in Umami',
      () =>
        Promise.all(
          tenants.map(async (tenant): Promise<TeamWork> => {
            // Each workspace on its own, so one failure never stops the rest
            try {
              const input = await gatherTenantTeam(
                connection,
                readerConnection,
                tenant
              );
              const plan = planTenantTeam(input);
              return plan.problem === 'team-missing' && input.statsTeamId
                ? {
                    tenant,
                    problem: { teamId: input.statsTeamId },
                    error: teamMissingAdvice(input.statsTeamId)
                  }
                : { tenant, input, plan };
            } catch (error) {
              const message = messageOf(error);
              return {
                tenant,
                problem: { error: message },
                error: `could not read: ${message}`
              };
            }
          })
        ),
      (list) => `${list.length} workspace(s) read`
    );

    return {
      steps: work.map((item) =>
        'problem' in item
          ? problemLine(item.tenant.deployment, item.problem)
          : teamLine(item.tenant.deployment, item.plan.steps)
      ),
      target: { environment, name: 'umami' },
      ...(work.every((item) => 'plan' in item && !item.plan.steps.length)
        ? { nothing: 'Every statistics team is in order' }
        : {}),
      data: { environment, databaseUrl, connection, work }
    };
  },

  async apply(ctx, { environment, databaseUrl, connection, work }) {
    const outcomes: TeamOutcome[] = [];
    for (const item of work as TeamWork[]) {
      const { tenant } = item;
      const { deployment } = tenant;
      if ('problem' in item) {
        outcomes.push({
          deployment,
          steps: [],
          status: 'failed',
          error: item.error
        });
        continue;
      }
      const { input, plan } = item;
      if (!plan.steps.length) {
        outcomes.push({ deployment, steps: [], status: 'ok' });
        continue;
      }
      try {
        const { done } = await ctx.ui.task(
          `Setting up the team of ${deployment}`,
          () =>
            applyTenantTeam(connection, tenant, plan, input, (teamId) =>
              recordTeamId(
                ctx.root,
                environment,
                databaseUrl,
                tenant.id,
                teamId
              )
            ),
          ({ done }) => done.join(', ') || 'no changes'
        );
        outcomes.push({ deployment, steps: done, status: 'done' });
      } catch (error) {
        const message = messageOf(error);
        ctx.ui.warn(`${deployment}: ${message}`);
        outcomes.push({
          deployment,
          steps: plan.steps,
          status: 'failed',
          error: message
        });
      }
    }

    const failed = outcomes.some(({ status }) => status === 'failed');
    return {
      summary: summarizeTeams(outcomes),
      partial: failed,
      next: failed
        ? ['Run `cdwr tenant stats-teams` again; it only does what is missing.']
        : undefined,
      json: { environment, outcomes }
    };
  }
});
