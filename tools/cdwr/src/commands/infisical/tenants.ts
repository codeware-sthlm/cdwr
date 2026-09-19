import { defineCommand, readOnly } from '../../cli/command';
import { environmentInput } from '../../services/environment';
import { readTenantDeployments } from '../../services/infisical';

/** Apps a tenant can be deployed with */
const APPS = ['cms', 'web'];

export default defineCommand({
  summary: 'Which tenants each app deploys for',
  description:
    'Read from the /tenants/<id>/apps/<app> folders in Infisical, which is what the deployment reads too.',
  danger: 'read',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput()
  },

  async plan(ctx, { environment }) {
    const deployments = await ctx.ui.task(
      `Reading tenant deployments for ${environment}`,
      () => readTenantDeployments(environment),
      (d) => `${d.size} tenant(s) in ${environment}`
    );
    const byApp: Record<string, string[]> = Object.fromEntries(
      APPS.map((app) => [app, []])
    );
    for (const [tenant, apps] of deployments) {
      for (const { app } of apps) (byApp[app] ??= []).push(tenant);
    }
    for (const tenants of Object.values(byApp)) tenants.sort();
    return readOnly(byApp);
  },

  async apply(ctx, byApp) {
    ctx.ui.table(
      ['app', 'tenants'],
      Object.entries(byApp).map(([app, tenants]) => [
        app,
        tenants.length ? tenants.join(', ') : '—'
      ])
    );
    return {
      summary: `${Object.keys(byApp).length} app(s) checked`,
      json: byApp
    };
  }
});
