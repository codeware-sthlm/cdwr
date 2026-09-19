import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { fly, listAppNames } from '../../services/fly';

import {
  type AppSummary,
  detailLines,
  stateLegend,
  summaryRow
} from './info.logic';

/** One app's status, certificates and secret names; undefined when it's gone */
async function fetchAppSummary(app: string): Promise<AppSummary | undefined> {
  const status = await fly().status({ app });
  if (!status) return undefined;

  let certs: AppSummary['certs'] = [];
  try {
    const list = await fly().certs.list({ app });
    certs = list.map(({ hostname, clientStatus }) => ({
      hostname,
      clientStatus
    }));
  } catch {
    // Certificates are extra context; a failed lookup shouldn't hide the app.
  }

  let secretNames: string[] = [];
  try {
    const list = await fly().secrets.list({ app });
    secretNames = list.map(({ name }) => name);
  } catch {
    // Same for secrets - only names are ever shown, never values.
  }

  return {
    name: status.name,
    deployed: status.deployed,
    hostname: status.hostname,
    version: status.version,
    organization: status.organization.slug,
    machines: status.machines,
    certs,
    secretNames
  };
}

export default defineCommand({
  summary: 'Show apps, machines, certificates and secret names',
  description:
    'One app shows the detail block; several show a table. Secret values are never read, only their names.',
  danger: 'read',
  needs: ['fly'],
  inputs: {
    prefix: input.string({
      prompt: 'Filter apps by prefix?',
      flagOnly: true,
      default: ''
    }),
    apps: input.multiselect<string>({
      prompt: 'Which apps?',
      description: 'Fly apps to inspect; leave empty for all',
      trustFlag: true,
      optional: true,
      choices: async (_ctx, resolved) => {
        const prefix =
          typeof resolved['prefix'] === 'string' ? resolved['prefix'] : '';
        return (await listAppNames())
          .filter((name) => name.startsWith(prefix))
          .map((value) => ({ value }));
      }
    })
  },

  async plan(ctx, { apps = [], prefix }) {
    const targets =
      apps.length > 0
        ? apps
        : await ctx.ui.task(
            'Listing apps',
            async () =>
              (await listAppNames()).filter((name) => name.startsWith(prefix)),
            (list) =>
              `${list.length} app(s)${prefix ? ` matching '${prefix}'` : ''}`
          );

    if (targets.length === 0) {
      return { steps: [], nothing: 'No apps found', data: { apps: [] } };
    }

    return {
      steps: targets.map((app) => `Read ${app}`),
      data: { apps: targets }
    };
  },

  async apply(ctx, { apps }) {
    const summaries: AppSummary[] = [];
    for (const app of apps) {
      const summary = await ctx.ui.task(
        `Reading ${app}`,
        () => fetchAppSummary(app),
        (s) => (s ? `${app} read` : `${app} not found`)
      );
      if (summary) summaries.push(summary);
    }

    if (summaries.length === 0) {
      return { summary: 'No app data retrieved', partial: true, json: [] };
    }

    if (summaries.length === 1) {
      const [only] = summaries;
      ctx.ui.note(detailLines(only), only.name);
    } else {
      ctx.ui.table(
        ['App', 'Status', 'States', 'Resources', 'Uptime', 'Certs', 'Secrets'],
        summaries.map(summaryRow)
      );
      ctx.ui.note(stateLegend(), 'States');
    }

    return {
      summary: `Read ${summaries.length} app(s)`,
      json: summaries
    };
  }
});
