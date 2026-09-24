import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  redactReported,
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
  type CreatedTenant,
  createSteps,
  deploymentNameProblem,
  parseCreatedTenant
} from './create.logic';

/** Creates the workspace in the cms app, where Payload lives */
async function createInPayload(
  root: string,
  environment: Environment,
  databaseUrl: string,
  fields: {
    name: string;
    locales: Array<string>;
    slug?: string;
    deployment?: string;
  },
  dryRun: boolean
): Promise<CreatedTenant> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'create-tenant.ts',
    environment,
    {
      CREATE_DATABASE_URL: databaseUrl,
      CREATE_NAME: fields.name,
      CREATE_LOCALES: fields.locales.join(','),
      CREATE_SLUG: fields.slug ?? '',
      CREATE_DEPLOYMENT: fields.deployment ?? '',
      CREATE_DRY_RUN: String(dryRun)
    }
  );

  try {
    return parseCreatedTenant(stdout);
  } catch (error) {
    // The key may already have been printed before whatever went wrong, and
    // this output ends up in a console and in shell history
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        '',
        '--- stdout ---',
        redactReported(stdout, 'CREATED_TENANT').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
}

interface PlanData {
  environment: Environment;
  databaseUrl: string;
  name: string;
  locales: Array<string>;
  slug?: string;
  deployment?: string;
  planned: CreatedTenant;
}

/**
 * Creates an empty workspace, which everything else assumes already exists.
 *
 * `apply-site` fills a workspace and `provision` sets up its secrets, but
 * neither makes one — until now that meant opening the admin, which is a poor
 * answer when the reason you want a workspace is to test a definition against
 * a fresh one.
 *
 * Nothing is deleted and nothing is filled: this makes the row, its slug and
 * its API key, and stops there.
 */
export default defineCommand<
  {
    environment: ReturnType<typeof environmentInput<typeof ENVIRONMENTS>>;
    previewApp: ReturnType<typeof previewAppInput>;
    name: ReturnType<typeof input.string>;
    locales: ReturnType<typeof input.multiselect>;
    slug: ReturnType<typeof input.string>;
    deployment: ReturnType<typeof input.string>;
  },
  PlanData
>({
  summary: 'Create an empty workspace in Payload',
  description:
    'Makes the tenant row and its API key, nothing else. Fill it with `cdwr tenant apply-site`.',
  danger: 'mutate',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(ENVIRONMENTS),
    previewApp: previewAppInput(),
    name: input.string({
      prompt: 'What is the workspace called?',
      description: 'Shown in the admin; the slug is derived from it',
      placeholder: 'cdwr.io'
    }),
    locales: input.multiselect<string>({
      prompt: 'Which locales should its site support?',
      description: 'A single locale hides the language selector',
      initial: ['en'],
      min: 1,
      choices: () => [
        { value: 'en', hint: 'English' },
        { value: 'sv', hint: 'Swedish' }
      ]
    }),
    slug: input.string({
      prompt: 'Slug? Leave empty to derive it from the name',
      description: 'Overrides the slug derived from the name',
      placeholder: 'derived from the name',
      optional: true
    }),
    deployment: input.string({
      prompt: 'Deployment name? Leave empty for a workspace that stays local',
      placeholder: 'none',
      description:
        'Its Infisical folder and the end of its Fly app names. It cannot be changed later',
      optional: true
    })
  },

  async plan(
    ctx,
    { environment, previewApp, name, locales, slug, deployment }
  ) {
    // Both optional, so undefined when nobody could be asked
    const wanted = {
      name,
      locales,
      slug: slug?.trim() || undefined,
      deployment: deployment?.trim() || undefined
    };

    // Catch it here rather than as a validation error after a tunnel has been
    // built and the database reached
    const problem = wanted.deployment
      ? deploymentNameProblem(wanted.deployment)
      : undefined;

    if (problem) {
      throw new CliError(`--deployment '${wanted.deployment}': ${problem}`);
    }

    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);

    // The same create, rolled back — so Payload judges every field and the
    // slug collision surfaces before anything is written
    const planned = await ctx.ui.task(
      `Creating '${name}' and rolling it back, to see what it does`,
      () =>
        withDatabase(databaseUrl, (url) =>
          createInPayload(ctx.root, environment, url, wanted, true)
        ),
      (t) => `Would be slugged '${t.slug}'`
    );

    return {
      steps: createSteps({ ...wanted, slug: planned.slug }),
      notes: [
        'The workspace is created empty. `cdwr tenant apply-site` fills it.',
        ...(wanted.deployment
          ? ['`cdwr tenant provision` sets up its secrets and deploys it.']
          : [
              'Without a deployment name it stays local: `provision` skips workspaces that have none.'
            ])
      ],
      target: { environment, name },
      data: {
        environment,
        databaseUrl,
        ...wanted,
        planned
      } satisfies PlanData
    };
  },

  async apply(ctx, data) {
    const { environment, databaseUrl, name, locales, slug, deployment } = data;

    const tenant = await ctx.ui.task(
      `Creating '${name}'`,
      () =>
        withDatabase(databaseUrl, (url) =>
          createInPayload(
            ctx.root,
            environment,
            url,
            { name, locales, slug, deployment },
            false
          )
        ),
      (t) => `Workspace '${t.slug}' created`
    );

    return {
      summary: `Created '${tenant.slug}' in ${environment}`,
      next: [
        'Fill it from a definition:',
        `  cdwr tenant apply-site --env=${environment} --tenant=${tenant.slug}`,
        ...(tenant.apiKey
          ? [
              '',
              'Its API key, which an external client authenticates with:',
              `  ${tenant.apiKey}`
            ]
          : [])
      ],
      // The key is deliberately here: `--json` is how a script gets it, and
      // reading it back out of Payload later means matching hashes by hand
      json: tenant
    };
  }
});
