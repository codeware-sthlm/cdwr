import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import { DEPLOYED } from '../../services/environment';
import { maskValues, readSecrets } from '../../services/infisical';
import { deployments, tenancyConfig } from '../../services/tenancy';
import { theme } from '../../ui/theme';

import { APPS, type EnvironmentAnalysis, summarize } from './analysis.logic';

export default defineCommand({
  summary: 'Deploy switches, tenant folders and app secrets side by side',
  description:
    'For preview and production, per app (cms, web, builder): whether the host deploys, each tenant folder with its DEPLOY_ENABLED state (on, off or no flag), and the app secrets. Secret values are masked unless --reveal is given.',
  danger: 'read',
  needs: ['infisical'],
  inputs: {
    reveal: input.boolean({ prompt: 'Show secret values', flagOnly: true })
  },

  async plan(ctx) {
    const results: EnvironmentAnalysis[] = [];
    for (const environment of DEPLOYED) {
      const config = tenancyConfig(ctx.env, environment);
      const analysis = await ctx.ui.task(
        `Analyzing ${environment}`,
        async () => {
          const plan = await deployments(config, [...APPS]);
          const secrets: Record<string, Record<string, string>> = {};
          for (const app of APPS) {
            secrets[app] = await readSecrets(environment, `/apps/${app}`);
          }
          return summarize(
            environment,
            plan.deployments,
            plan.skipped,
            secrets
          );
        },
        (a) => `${a.apps.length} app(s) analyzed`
      );
      results.push(analysis);
    }
    return readOnly(results);
  },

  async apply(ctx, results, { reveal }) {
    for (const { environment, apps } of results) {
      ctx.ui.info(theme.title(environment));
      for (const { app, host, tenants, secrets } of apps) {
        ctx.ui.info(
          `${app}: host ${host}; ${
            tenants.length
              ? tenants
                  .map(({ tenant, flag }) => `${tenant} ${flag}`)
                  .join(', ')
              : 'no tenant folders'
          }`
        );
        ctx.ui.table(
          ['key', 'value'],
          Object.entries(reveal ? secrets : maskValues(secrets))
        );
      }
    }
    return {
      summary: `Analyzed ${results.length} environment(s)`,
      json: results.map(({ environment, apps }) => ({
        environment,
        apps: apps.map(({ app, host, tenants, secrets }) => ({
          app,
          host,
          tenants,
          secrets: reveal ? secrets : maskValues(secrets)
        }))
      }))
    };
  }
});
