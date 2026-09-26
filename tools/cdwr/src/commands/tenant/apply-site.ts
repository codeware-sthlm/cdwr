import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  resolveDatabaseUrl,
  runCmsScript,
  withDatabase
} from '../../services/database';
import {
  ENVIRONMENTS,
  environmentInput,
  previewAppInput
} from '../../services/environment';
import type { Environment } from '../../services/infisical';
import {
  definitionInput,
  resolveDefinitionPath
} from '../../services/site-definitions';

import {
  type ApplyReport,
  nothingToApply,
  parseApplyReport,
  planNotes,
  planSteps,
  resultSummary
} from './apply-site.logic';

/**
 * Runs the apply in the cms app, where Payload lives.
 *
 * A dry run is not a simulation: the definition really is applied, inside a
 * transaction that is then rolled back, so Payload validates every field and
 * relationship on the way in. What the plan shows is what the write did.
 */
export async function applyInPayload(
  root: string,
  environment: Environment,
  databaseUrl: string,
  tenantSlug: string,
  definitionPath: string,
  dryRun: boolean,
  fresh = false
): Promise<ApplyReport> {
  const { stdout } = await runCmsScript(
    root,
    'apply-site.ts',
    environment,
    {
      APPLY_DATABASE_URL: databaseUrl,
      APPLY_TENANT_SLUG: tenantSlug,
      APPLY_DEFINITION: definitionPath,
      APPLY_DRY_RUN: String(dryRun),
      APPLY_FRESH: String(fresh)
    },
    { reports: 'APPLY_REPORT' }
  );

  return parseApplyReport(stdout);
}

interface PlanData {
  environment: Environment;
  databaseUrl: string;
  tenant: string;
  definitionPath: string;
  fresh: boolean;
  report: ApplyReport;
}

/**
 * Fills a tenant's workspace from a site definition held in the repository.
 *
 * The definition states one site and carries no identity — the tenant is named
 * here. Nothing is ever deleted: a definition says what should exist, not that
 * nothing else may, so a page it stops mentioning stays where it is.
 */
export default defineCommand<
  {
    environment: ReturnType<typeof environmentInput<typeof ENVIRONMENTS>>;
    previewApp: ReturnType<typeof previewAppInput>;
    tenant: ReturnType<typeof input.string>;
    definition: ReturnType<typeof definitionInput>;
    fresh: ReturnType<typeof input.optional<boolean>>;
  },
  PlanData
>({
  summary: 'Fill a tenant from a site definition in the repository',
  description:
    'The plan is produced by applying the definition and rolling it back, so it is what the write actually did rather than a guess. Nothing is deleted — except with --fresh, in development, which first removes what this definition created.',
  danger: 'mutate',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(ENVIRONMENTS),
    previewApp: previewAppInput(),
    tenant: input.string({
      prompt: 'Which tenant slug?',
      description: 'The workspace to fill. It must already exist'
    }),
    definition: definitionInput('Which definition should fill it?'),
    // Development only: asked there, and refused as a flag anywhere else
    fresh: input.optional(
      input.boolean({
        prompt:
          'Start fresh? Removes what this definition created, then applies it again',
        description:
          'Remove what this definition created first, so the site matches it — including edits made to those documents in the admin'
      }),
      (resolved) => resolved['environment'] === 'development'
    )
  },

  async plan(ctx, { environment, previewApp, tenant, definition, fresh }) {
    const isFresh = fresh === true;
    const definitionPath = resolveDefinitionPath(ctx.root, definition);

    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);

    const report = await ctx.ui.task(
      `Applying to '${tenant}' and rolling back, to see what it does`,
      () =>
        withDatabase(databaseUrl, (url) =>
          applyInPayload(
            ctx.root,
            environment,
            url,
            tenant,
            definitionPath,
            true,
            isFresh
          )
        ),
      (r) => `${r.outcomes.length} document(s) considered`
    );

    // A reference that leads nowhere publishes a page without its image. The
    // apply refuses it, so the plan should not offer to continue
    if (report.unresolved.length) {
      throw new CliError(
        [
          `The definition has ${report.unresolved.length} reference(s) that lead nowhere:`,
          ...report.unresolved.map(
            ({ blockType, field, lookup }) =>
              `  ${blockType}.${field} → '${lookup}'`
          ),
          '',
          'Nothing was written. Fix the definition and run again.'
        ].join('\n')
      );
    }

    return {
      steps: planSteps(report),
      notes: planNotes(report),
      target: { environment, name: tenant },
      nothing: nothingToApply(report)
        ? `'${tenant}' already has everything the definition names`
        : undefined,
      data: {
        environment,
        databaseUrl,
        tenant,
        definitionPath,
        fresh: isFresh,
        report
      }
    };
  },

  async apply(ctx, data) {
    const { environment, databaseUrl, tenant, definitionPath, fresh } = data;

    const report = await ctx.ui.task(
      `Applying to '${tenant}'`,
      () =>
        withDatabase(databaseUrl, (url) =>
          applyInPayload(
            ctx.root,
            environment,
            url,
            tenant,
            definitionPath,
            false,
            fresh
          )
        ),
      (r) => `${r.outcomes.length} document(s)`
    );

    // The engine rolls back rather than committing a site that is incomplete,
    // and says so in the report instead of throwing
    if (report.dryRun) {
      throw new CliError(
        'The apply rolled back. Nothing was written — see the references reported above.'
      );
    }

    const { summary, details } = resultSummary(report);

    return {
      summary,
      details,
      next: [
        `Open the workspace and check '${tenant}' reads the way the definition intends`
      ],
      json: report
    };
  }
});
