import { type Plan, defineCommand } from '../../cli/command';
import { UsageError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { DEPLOYED, environmentInput } from '../../services/environment';
import { readOwnSecrets, setInfisicalSecret } from '../../services/infisical';
import { rewriteProblem } from '../agent/apply-list.logic';

import {
  type RewriteData,
  givenParts,
  partArgs,
  rewrite,
  rewriteOutcome,
  shapeLines
} from './rewrite-url.logic';
import { digest, guard, refuse, refuseChanged } from './secret-values.logic';

export default defineCommand({
  summary:
    'Rewrite the host, port or user of a url secret, keeping its password',
  description:
    'Changes only the host, port and user of a url that has a password; the password and the rest of the url are kept as they are. Never shows a value. Only production and preview, and only /apps/<app> or /tenants/<slug>/apps/<app>.',
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
      description: 'The url secret to rewrite, e.g. DATABASE_URL'
    }),
    host: input.optional(
      input.string({
        prompt: 'New host?',
        short: 'o',
        description: 'The new host; empty keeps it'
      }),
      () => true
    ),
    port: input.optional(
      input.string({
        prompt: 'New port?',
        short: 'p',
        description: 'The new port, 1 to 65535; empty keeps it'
      }),
      () => true
    ),
    user: input.optional(
      input.string({
        prompt: 'New user?',
        short: 'u',
        description: 'The new user name; empty keeps it'
      }),
      () => true
    )
  },

  async plan(
    ctx,
    { environment, folder, key, host, port, user }
  ): Promise<Plan<RewriteData>> {
    const parts = givenParts({ host, port, user });
    refuse(rewriteProblem(environment, folder, key, partArgs(parts)));
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      const current = secrets[key];
      if (current === undefined) {
        throw new UsageError(`${key} not found at ${folder}`);
      }
      known.push(current);
      const result = rewrite(current, parts, folder, key);
      known.push(...result.secrets);
      const data: RewriteData = {
        environment,
        folder,
        key,
        state: result.state,
        shape: result.shape,
        read: digest(current)
      };
      if (result.state === 'same') {
        return {
          steps: [],
          nothing: 'already rewritten',
          data,
          json: data
        };
      }
      return {
        steps: [
          `Rewrite ${key} at ${folder} in ${environment}`,
          ...shapeLines(result.shape, [result.userFrom, result.userTo])
        ],
        notes: [
          'The password and the rest of the url are kept; no value is shown'
        ],
        target: { environment, name: `${folder}/${key}` },
        data,
        json: data
      };
    });
  },

  async apply(ctx, data, { host, port, user }) {
    const { environment, folder, key } = data;
    const parts = givenParts({ host, port, user });
    const known: string[] = [];
    return guard(known, async () => {
      const secrets = await ctx.ui.task(
        `Re-reading ${folder} for ${environment}`,
        () => readOwnSecrets(environment, folder)
      );
      const current = secrets[key];
      if (current === undefined) {
        throw new Error(
          `${key} was removed from ${folder} in ${environment} since the plan; nothing written`
        );
      }
      known.push(current);
      refuseChanged(data.read, current, key, folder);
      const result = rewrite(current, parts, folder, key);
      known.push(...result.secrets);
      await ctx.ui.task(`Writing ${key} at ${folder}`, () =>
        setInfisicalSecret({
          environment,
          path: folder,
          key,
          value: result.next
        })
      );
      const outcome = rewriteOutcome(data, [result.userFrom, result.userTo]);
      return { summary: outcome, json: { ...data, outcome } };
    });
  }
});
