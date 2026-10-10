import { defineCommand, readOnly } from '../../cli/command';
import { environmentInput } from '../../services/environment';
import { readTenantDeployments } from '../../services/infisical';

import { type TenantFlag, flagStateOf } from './analysis.logic';

/** Apps a tenant can be deployed with */
const APPS = ['cms', 'web'];

export default defineCommand({
  summary: 'Tenant folders per app and their deploy switch',
  description:
    'Read from the /tenants/<id>/apps/<app> folders in Infisical, which is what the deployment reads too. Each folder shows its DEPLOY_ENABLED state: on, off or no flag.',
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
    const byApp: Record<string, TenantFlag[]> = Object.fromEntries(
      APPS.map((app) => [app, []])
    );
    for (const [tenant, apps] of deployments) {
      for (const { app, flag } of apps) {
        (byApp[app] ??= []).push({ tenant, flag: flagStateOf(flag) });
      }
    }
    for (const tenants of Object.values(byApp)) {
      tenants.sort((a, b) => a.tenant.localeCompare(b.tenant));
    }
    return readOnly(byApp);
  },

  async apply(ctx, byApp) {
    ctx.ui.table(
      ['app', 'tenants'],
      Object.entries(byApp).map(([app, tenants]) => [
        app,
        tenants.length
          ? tenants.map(({ tenant, flag }) => `${tenant} (${flag})`).join(', ')
          : '—'
      ])
    );
    return {
      summary: `${Object.keys(byApp).length} app(s) checked`,
      json: byApp
    };
  }
});
