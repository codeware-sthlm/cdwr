import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import {
  fly,
  machinesOf,
  pullRequestOf,
  scaleMachines
} from '../../services/fly';

export default defineCommand({
  summary: 'Set how many machines a Fly app runs',
  description:
    'Scales the app to one to four machines with `flyctl scale count`. Fly creates or destroys machines to match.',
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
    }),
    count: input.number({
      prompt: 'How many machines?',
      description: 'Machines to run, 1 to 4',
      positional: true,
      schema: z.number().int().min(1).max(4)
    })
  },

  async plan(ctx, { app, count }) {
    const machines = await ctx.ui.task(
      `Reading machines of ${app}`,
      () => machinesOf(app),
      (list) => `${list.length} machine(s) in ${app}`
    );
    const environment = pullRequestOf(app) ? 'preview' : 'production';
    return {
      steps: [`Scale ${app} from ${machines.length} to ${count}`],
      target: { environment, name: app },
      json: { app, environment, count: machines.length, target: count },
      data: { app, count }
    };
  },

  async apply(ctx, { app, count }) {
    await ctx.ui.task(
      `Scaling ${app} to ${count}`,
      () => scaleMachines(app, count),
      () => `${app} scaled to ${count}`
    );
    const machines = await machinesOf(app);
    return {
      summary: `${app} runs ${machines.length} machine(s)`,
      json: { app, count: machines.length }
    };
  }
});
