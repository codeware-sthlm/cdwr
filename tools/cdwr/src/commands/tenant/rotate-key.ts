import { defineCommand } from '../../cli/command';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  redactReported,
  resolveDatabaseUrl,
  runCmsScript,
  withDatabase
} from '../../services/database';
import { environmentInput, previewAppInput } from '../../services/environment';
import {
  flyAppName,
  pullRequestOf,
  setSecretsTogether,
  startMachines
} from '../../services/fly';
import {
  type Environment,
  assertWritable,
  readTenantDeployments,
  setInfisicalSecret
} from '../../services/infisical';

import {
  apiKeyMismatch,
  isPreWriteFailure,
  parseRotationOutput,
  summarizeTenantKeys,
  tenantFlyApps
} from './rotate-key.logic';

/** Rotate the key in Payload via the local-api and return the new value */
async function rotateInPayload(
  root: string,
  environment: Environment,
  currentApiKey: string,
  databaseUrl: string,
  dryRun = false
): Promise<{ apiKey: string; slug: string }> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'rotate-tenant-key.ts',
    environment,
    {
      ROTATE_DATABASE_URL: databaseUrl,
      ROTATE_CURRENT_API_KEY: currentApiKey,
      ROTATE_DRY_RUN: String(dryRun)
    }
  );
  const { apiKey, slug } = parseRotationOutput(stdout);

  if (!slug || (!dryRun && !apiKey)) {
    // The key may already have been written and printed before whatever went
    // wrong here, and this output ends up in a console and in shell history
    throw new Error(
      [
        'Rotation script did not report a result.',
        '',
        '--- stdout ---',
        redactReported(stdout, 'ROTATED_API_KEY').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
  return { apiKey, slug };
}

interface PlanData {
  environment: Environment;
  previewApp: string | undefined;
  tenant: string;
  apps: string[];
  currentApiKey: string;
  slug: string;
  databaseUrl: string;
}

/**
 * Rotates a tenant's Payload API key everywhere it is trusted: Payload first,
 * then every Infisical folder that holds it, then the Fly apps that
 * authenticate with it.
 */
export default defineCommand({
  summary: "Rotate a tenant's Payload API key everywhere",
  description:
    'The running deployments keep using the old key until they are restarted, so the tenant serves errors until this completes.',
  danger: 'destructive',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(),
    previewApp: previewAppInput(),
    tenant: input.select<string>({
      prompt: 'Which tenant?',
      description: 'Deployment id under /tenants',
      choices: async (ctx, resolved) => {
        const environment = resolved['environment'] as Environment;
        const deployments = await readTenantDeployments(environment);
        const choices: Array<{ value: string; hint: string }> = [];
        for (const [tenantId, apps] of deployments) {
          const { apps: withKey } = summarizeTenantKeys(apps);
          if (withKey.length)
            choices.push({ value: tenantId, hint: withKey.join(', ') });
        }
        return choices;
      }
    })
  },

  async plan(ctx, { environment, previewApp, tenant }) {
    const deployments = await ctx.ui.task(
      `Reading tenants for ${environment} from Infisical`,
      () => readTenantDeployments(environment),
      (d) => `${d.size} tenant(s) found`
    );
    const { apps, apiKeys } = summarizeTenantKeys(
      deployments.get(tenant) ?? []
    );

    if (apiKeyMismatch(apiKeys)) {
      throw new CliError(
        `The app folders under /tenants/${tenant} hold different PAYLOAD_API_KEY values. Reconcile them before rotating.`
      );
    }
    const currentApiKey = apiKeys[0];
    if (!apps.length || !currentApiKey) {
      throw new CliError(
        `No PAYLOAD_API_KEY found for '${tenant}' in ${environment}`
      );
    }

    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);

    // Resolve first, so the tenant being rotated is named before anything is written
    const { slug } = await ctx.ui.task(
      'Resolving which Payload tenant holds this key',
      () =>
        withDatabase(
          databaseUrl,
          (url) =>
            rotateInPayload(ctx.root, environment, currentApiKey, url, true),
          {
            isRetryable: (error) => isPreWriteFailure(messageOf(error)),
            onRetry: (attempt) =>
              ctx.ui.info(
                `Tunnel dropped, rebuilding (attempt ${attempt + 1})...`
              )
          }
        ),
      (r) => `Resolved to Payload tenant '${r.slug}'`
    );

    return {
      steps: [
        `Rotate the key in Payload for tenant '${slug}'`,
        ...apps.map(
          (app) => `Update PAYLOAD_API_KEY in /tenants/${tenant}/apps/${app}`
        ),
        'Stage the new key on every Fly app, then apply it (which restarts them)'
      ],
      target: { environment, name: tenant },
      data: {
        environment,
        previewApp,
        tenant,
        apps,
        currentApiKey,
        slug,
        databaseUrl
      } satisfies PlanData
    };
  },

  async apply(ctx, data) {
    const {
      environment,
      previewApp,
      tenant,
      apps,
      currentApiKey,
      databaseUrl
    } = data;

    // Payload is written first, so an Infisical token that cannot edit would
    // leave the tenant holding a key nothing else has; a probe write proves it can
    try {
      await ctx.ui.task('Checking Infisical accepts writes', () =>
        Promise.all(
          apps.map((app) =>
            assertWritable(environment, `/tenants/${tenant}/apps/${app}`)
          )
        )
      );
    } catch (error) {
      throw new CliError(
        messageOf(error),
        EXIT.failed,
        'Nothing was changed - Payload is untouched and the tenant still works. Rotation writes to Infisical, so its credentials need to create and edit secrets under /tenants.'
      );
    }

    // From here the Payload key is already live - every write below has to
    // land or the tenant stays broken with no way back to the old key
    const rotated = await ctx.ui.task(
      `Rotating key for '${data.slug}'`,
      () =>
        withDatabase(
          databaseUrl,
          (url) => rotateInPayload(ctx.root, environment, currentApiKey, url),
          {
            isRetryable: (error) => isPreWriteFailure(messageOf(error)),
            onRetry: (attempt) =>
              ctx.ui.info(
                `Tunnel dropped, rebuilding (attempt ${attempt + 1})...`
              )
          }
        ),
      (r) => `Payload tenant '${r.slug}' updated`
    );

    const updated: string[] = [];
    const failed: string[] = [];
    for (const app of apps) {
      const secretPath = `/tenants/${tenant}/apps/${app}`;
      try {
        await ctx.ui.task(`Updating ${secretPath}`, () =>
          setInfisicalSecret({
            environment,
            path: secretPath,
            key: 'PAYLOAD_API_KEY',
            value: rotated.apiKey
          })
        );
        updated.push(secretPath);
      } catch (error) {
        ctx.ui.error(messageOf(error));
        failed.push(secretPath);
      }
    }

    if (failed.length) {
      return {
        summary: `Rotated the Payload key for '${rotated.slug}' but Infisical is out of sync`,
        partial: true,
        next: [
          'Payload now expects the new key but these paths were not updated:',
          ...failed.map((p) => `  ${p}`),
          '',
          `Set PAYLOAD_API_KEY manually before redeploying, using the value now stored at ${
            updated[0] ?? "the Payload admin's Tenants collection"
          }.`
        ],
        json: { tenant, slug: rotated.slug, environment, failed }
      };
    }

    // A redeploy would not finish the job: the deployment only sets secrets
    // that are missing and skips any that already exist, so a rotated key
    // never reaches a running app that way. Write it to the Fly apps directly.
    const pullRequest = previewApp ? pullRequestOf(previewApp) : undefined;
    const flyApps = tenantFlyApps(apps, (app) =>
      flyAppName(ctx.root, app, tenant, pullRequest)
    );

    // Stage everywhere first, then apply, so every app changes together
    // instead of each restarting as its own secret lands
    const staged: string[] = [];
    const applied: string[] = [];
    try {
      await ctx.ui.task(
        'Staging and applying the new key on Fly',
        async () => {
          for (const { flyApp } of flyApps) await startMachines(flyApp);
          await setSecretsTogether(
            flyApps.map(({ flyApp }) => flyApp),
            { PAYLOAD_API_KEY: rotated.apiKey },
            (app, phase) => (phase === 'stage' ? staged : applied).push(app)
          );
        },
        () => `Applied to ${flyApps.length} app(s)`
      );
    } catch (error) {
      const inApplyPhase = applied.length > 0;
      if (inApplyPhase) applied.pop();
      else staged.pop();
      const pending = inApplyPhase
        ? flyApps.filter(({ flyApp }) => !applied.includes(flyApp))
        : flyApps.filter(({ flyApp }) => !staged.includes(flyApp));

      return {
        summary: inApplyPhase
          ? 'The new key is staged everywhere but not every app applied it'
          : 'Infisical holds the new key, but staging on Fly failed',
        partial: true,
        next: [
          messageOf(error),
          'Finish the remaining apps by hand:',
          ...(inApplyPhase
            ? pending.map(
                ({ flyApp }) => `  fly secrets deploy --app ${flyApp}`
              )
            : pending.map(
                ({ app, flyApp }) =>
                  `  fly secrets set PAYLOAD_API_KEY=<value from Infisical /tenants/${tenant}/apps/${app}> --app ${flyApp}`
              ))
        ],
        json: { tenant, slug: rotated.slug, environment, staged, applied }
      };
    }

    // Applying staged secrets already restarts the machines
    return {
      summary: `Rotated API key for '${tenant}' (tenant '${rotated.slug}') in ${environment}`,
      json: {
        tenant,
        slug: rotated.slug,
        environment,
        apps,
        flyApps: flyApps.map(({ flyApp }) => flyApp)
      }
    };
  }
});
