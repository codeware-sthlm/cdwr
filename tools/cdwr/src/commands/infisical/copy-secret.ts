import { type Plan, defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { DEPLOYED, environmentInput } from '../../services/environment';
import { readOwnSecrets, setInfisicalSecret } from '../../services/infisical';
import { copyProblem } from '../agent/apply-list.logic';

import { type CopyData, copyOutcome, copyState } from './copy-secret.logic';
import { digest, guard, refuse, refuseChanged } from './secret-values.logic';

export default defineCommand({
  summary: 'Copy one secret to another key in the same Infisical folder',
  description:
    'Copies the value of one key to another key at an app folder, never overwriting. Never shows a value. Only production and preview, and only /apps/<app> or /tenants/<slug>/apps/<app>.',
  danger: 'mutate',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(DEPLOYED),
    folder: input.string({
      prompt: 'Which Infisical folder?',
      short: 'f',
      description: 'An app folder, e.g. /apps/cms'
    }),
    from: input.string({
      prompt: 'Copy which key?',
      short: 's',
      description: 'The key to read, e.g. DATABASE_URL'
    }),
    to: input.string({
      prompt: 'Copy to which key?',
      short: 't',
      description: 'The key to write, which must not hold another value'
    })
  },

  async plan(ctx, { environment, folder, from, to }): Promise<Plan<CopyData>> {
    refuse(copyProblem(environment, folder, from, to));
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      known.push(secrets[from] ?? '', secrets[to] ?? '');
      const state = copyState(folder, from, to, secrets[from], secrets[to]);
      const data: CopyData = {
        environment,
        folder,
        from,
        to,
        state,
        read: digest(secrets[from])
      };
      if (state === 'same') {
        return {
          steps: [],
          nothing: 'already copied',
          data,
          json: data
        };
      }
      return {
        steps: [`Copy ${from} to ${to} at ${folder} in ${environment}`],
        notes: ['The value is copied as it is and never shown'],
        target: { environment, name: `${folder}/${to}` },
        data,
        json: data
      };
    });
  },

  async apply(ctx, data) {
    const { environment, folder, from, to } = data;
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Re-reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      known.push(secrets[from] ?? '', secrets[to] ?? '');
      const source = secrets[from];
      refuseChanged(data.read, source, from, folder);
      const state = copyState(folder, from, to, source, secrets[to]);
      if (state !== data.state || source === undefined) {
        throw new Error(
          `${to} at ${folder} changed in ${environment} since the plan; nothing written. Re-run to see the new plan`
        );
      }
      await ctx.ui.task(`Writing ${to} at ${folder}`, () =>
        setInfisicalSecret({
          environment,
          path: folder,
          key: to,
          value: source
        })
      );
      const outcome = copyOutcome(data);
      return {
        summary: outcome,
        json: { ...data, outcome }
      };
    });
  }
});
