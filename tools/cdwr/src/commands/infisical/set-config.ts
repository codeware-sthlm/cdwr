import { type Plan, defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { DEPLOYED, environmentInput } from '../../services/environment';
import { readOwnSecrets, setInfisicalSecret } from '../../services/infisical';
import { setConfigProblem } from '../agent/apply-list.logic';

import { guard, refuse, refuseChanged, remember } from './secret-values.logic';
import { type SetData, setOutcome, setState } from './set-config.logic';

export default defineCommand({
  summary: 'Set one non-secret config value in an Infisical folder',
  description:
    'Writes a number, true, false or an https url without credentials. Refuses keys that look like secrets. Only production and preview, and only /apps/<app> or /tenants/<slug>/apps/<app>.',
  danger: 'mutate',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(DEPLOYED),
    folder: input.string({
      prompt: 'Which Infisical folder?',
      short: 'f',
      description: 'An app folder, e.g. /apps/cms'
    }),
    key: input.string({
      prompt: 'Which key?',
      short: 'k',
      description: 'The key to write, e.g. DATABASE_POOL_MAX'
    }),
    value: input.string({
      prompt: 'Which value?',
      short: 'a',
      description: 'A whole number, true, false or an https url'
    })
  },

  async plan(ctx, { environment, folder, key, value }): Promise<Plan<SetData>> {
    refuse(setConfigProblem(environment, folder, key, value));
    // The current value may be anything, so it is scrubbed; the new one is public
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      const current = secrets[key];
      if (current !== undefined && current !== value) known.push(current);
      const data: SetData = {
        environment,
        folder,
        key,
        value,
        state: setState(current, value),
        read: remember(current)
      };
      if (data.state === 'same') {
        return { steps: [], nothing: 'already set', data, json: data };
      }
      return {
        steps: [`Set ${key} at ${folder} in ${environment} to ${value}`],
        notes:
          data.state === 'different'
            ? [`${key} holds another value now; it is replaced`]
            : [],
        target: { environment, name: `${folder}/${key}` },
        data,
        json: data
      };
    });
  },

  async apply(ctx, data) {
    const { environment, folder, key, value } = data;
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Re-reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      const current = secrets[key];
      if (current !== undefined && current !== value) known.push(current);
      refuseChanged(data.read, current, key, folder);
      if (setState(current, value) !== data.state) {
        throw new Error(
          `${key} at ${folder} changed in ${environment} since the plan; nothing written. Re-run to see the new plan`
        );
      }
      await ctx.ui.task(`Writing ${key} at ${folder}`, () =>
        setInfisicalSecret({ environment, path: folder, key, value })
      );
      const outcome = setOutcome(data);
      return { summary: outcome, json: { ...data, outcome } };
    });
  }
});
