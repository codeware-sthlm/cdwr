import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import {
  fly,
  machinesOf,
  pullRequestOf,
  restartMachines
} from '../../services/fly';

/**
 * Template for a mutating command: a select input loaded from Fly, a plan
 * that names the target so production gets a confirmation, an apply that
 * reports progress through the UI.
 */
export default defineCommand({
  summary: 'Restart every machine of a Fly app, one at a time',
  description:
    'A cold restart, so the app re-reads what it fetches at boot. Machines are restarted in turn and the app keeps serving.',
  danger: 'mutate',
  confirm: 'always',
  needs: ['fly'],
  inputs: {
    app: input.select<string>({
      prompt: 'Which app?',
      description: 'Fly app name',
      positional: true,
      remember: true,
      choices: async () => {
        const apps = await fly().apps.list();
        return apps
          .map((app) => ({
            value: app.name,
            hint: `${app.status} | ${app.organization.slug}`
          }))
          .sort((a, b) => a.value.localeCompare(b.value));
      }
    })
  },

  async plan(ctx, { app }) {
    const machines = await ctx.ui.task(
      `Reading machines of ${app}`,
      () => machinesOf(app),
      (list) => `${list.length} machine(s) in ${app}`
    );
    return {
      steps: machines.map((m) => ({
        label: `Restart ${m.id}`,
        detail: `${m.name}, ${m.state}`
      })),
      target: {
        environment: pullRequestOf(app) ? 'preview' : 'production',
        name: app
      },
      data: { app }
    };
  },

  async apply(ctx, { app }) {
    const count = await restartMachines(app, (id, index, total) =>
      ctx.ui.info(`Restarting ${id} (${index + 1}/${total})`)
    );
    return {
      summary: `Restarted ${count} machine(s) of ${app}`,
      json: { app, machines: count }
    };
  }
});
