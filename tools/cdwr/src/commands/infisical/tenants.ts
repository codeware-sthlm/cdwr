import { fetchAppTenants } from '@codeware/shared/feature/tenancy';

import { defineCommand, readOnly } from '../../cli/command';
import { environmentInput } from '../../services/environment';

/** Apps checked for tenant deployments */
const APPS = ['web', 'cms'];

export default defineCommand({
  summary: 'Which tenants each app deploys for',
  description:
    'Discovers tenant-app relationships from the /tenants folder structure in Infisical.',
  danger: 'read',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput()
  },

  async plan(ctx, { environment }) {
    const appTenants = await ctx.ui.task(
      `Reading tenant deployments for ${environment}`,
      () =>
        fetchAppTenants(
          {
            environment,
            site: 'eu',
            clientId: ctx.env['INFISICAL_CLIENT_ID'] ?? '',
            clientSecret: ctx.env['INFISICAL_CLIENT_SECRET'] ?? '',
            projectId: ctx.env['INFISICAL_PROJECT_ID'] ?? ''
          },
          APPS
        ),
      (result) => `${Object.values(result).flat().length} tenant deployment(s)`
    );
    return readOnly(appTenants);
  },

  async apply(ctx, appTenants) {
    ctx.ui.table(
      ['app', 'tenants'],
      Object.entries(appTenants).map(([app, tenants]) => [
        app,
        tenants.length ? tenants.map((t) => t.tenant).join(', ') : '—'
      ])
    );
    return {
      summary: `${Object.keys(appTenants).length} app(s) checked`,
      json: appTenants
    };
  }
});
