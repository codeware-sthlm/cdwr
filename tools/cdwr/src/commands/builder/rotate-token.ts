import { defineCommand } from '../../cli/command';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { DEPLOYED, environmentInput } from '../../services/environment';
import {
  configAppName,
  listAppNames,
  restartMachines
} from '../../services/fly';
import {
  type Environment,
  assertWritable,
  deleteInfisicalSecret,
  readSecrets,
  setInfisicalSecret
} from '../../services/infisical';
import { generateSecret } from '../signature/rotate.logic';

import {
  type AffectedApps,
  BUILDER_PATH,
  CMS_PATH,
  PREVIOUS,
  type Progress,
  type Stage,
  TOKEN,
  classifyApps,
  deriveStage,
  remainingSteps
} from './rotate-token.logic';

async function readState(
  environment: Environment
): Promise<{ stage: Stage; active: string }> {
  const [builder, cms] = await Promise.all([
    readSecrets(environment, BUILDER_PATH),
    readSecrets(environment, CMS_PATH)
  ]);
  const stage = deriveStage({
    active: builder[TOKEN],
    previous: builder[PREVIOUS],
    cms: cms[TOKEN]
  });
  return { stage, active: builder[TOKEN] as string };
}

async function fetchAffectedApps(
  root: string,
  environment: Environment
): Promise<AffectedApps> {
  return classifyApps(
    await listAppNames(),
    configAppName(root, 'builder'),
    configAppName(root, 'cms'),
    environment
  );
}

/**
 * The builder accepts both tokens before the cms sends the new one, and the
 * previous one is retired only once every cms app has restarted, so no request
 * is refused on the way. Both apps read Infisical at boot: a restart is all it
 * takes, no redeploy.
 */
export default defineCommand({
  summary: 'Roll over the builder token, step by step',
  description:
    'Gives the builder a new token while it still accepts the old one, switches the cms to the new token, then retires the old one, restarting the affected apps between steps.',
  danger: 'destructive',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(DEPLOYED)
  },

  async plan(ctx, { environment }) {
    const { stage, active } = await ctx.ui.task(
      `Reading ${TOKEN} for ${environment}`,
      () => readState(environment),
      (s) =>
        s.stage === 'not-started'
          ? 'Nothing staged yet'
          : `Resuming a rollover already at '${s.stage}'`
    );

    const apps = await ctx.ui.task(
      'Finding apps that use the builder token',
      () => fetchAffectedApps(ctx.root, environment),
      (a) => `${a.builders.length} builder(s), ${a.cms.length} cms app(s)`
    );

    if (!apps.builders.length || !apps.cms.length) {
      throw new Error(
        `Expected both builder and cms apps in ${environment}, found ` +
          `builders=[${apps.builders.join(', ')}] cms=[${apps.cms.join(', ')}]`
      );
    }

    return {
      steps: remainingSteps(stage),
      notes: [
        `builder: ${apps.builders.join(', ')}`,
        `cms:     ${apps.cms.join(', ')}`
      ],
      target: { environment, name: 'builder' },
      data: { environment, stage, active, apps }
    };
  },

  async apply(ctx, { environment, stage, active, apps }) {
    // Probe writes, so they belong here and not in the plan
    await ctx.ui.task('Checking Infisical accepts writes', async () => {
      await assertWritable(environment, BUILDER_PATH);
      await assertWritable(environment, CMS_PATH);
    });

    const restartAll = async (names: string[]) => {
      for (const app of names) {
        await ctx.ui.task(`Restarting ${app}`, () => restartMachines(app));
      }
    };

    let current: Progress = stage;
    // The token the cms is to send; a resumed run reads it from the builder
    let token = active;
    try {
      // Step 1 - the builder keeps the old token as previous and gets a new
      // one, so it accepts both. Previous first: it is the only copy of the old
      if (current === 'not-started') {
        token = generateSecret();
        await ctx.ui.task(`Staging ${PREVIOUS}`, () =>
          setInfisicalSecret({
            environment,
            path: BUILDER_PATH,
            key: PREVIOUS,
            value: active
          })
        );
        await ctx.ui.task(`Generating a new ${TOKEN} for the builder`, () =>
          setInfisicalSecret({
            environment,
            path: BUILDER_PATH,
            key: TOKEN,
            value: token
          })
        );
        await restartAll(apps.builders);
        current = 'staged';
      } else if (current === 'staged') {
        // The earlier run may have stopped before the restart
        await restartAll(apps.builders);
      }

      // Step 2 - the cms sends the new token; the builder already accepts it
      if (current === 'staged') {
        await ctx.ui.task(`Giving the cms the new ${TOKEN}`, () =>
          setInfisicalSecret({
            environment,
            path: CMS_PATH,
            key: TOKEN,
            value: token
          })
        );
        await restartAll(apps.cms);
        current = 'switched';
      } else if (current === 'switched') {
        // The earlier run may have stopped part way through the restarts
        await restartAll(apps.cms);
      }

      // Step 3 - only the new token is accepted from here
      if (current === 'switched') {
        await ctx.ui.task(`Retiring ${PREVIOUS}`, () =>
          deleteInfisicalSecret({
            environment,
            path: BUILDER_PATH,
            key: PREVIOUS
          })
        );
        await restartAll(apps.builders);
        current = 'complete';
      }
    } catch (error) {
      throw new CliError(
        `Rollover interrupted at '${current}': ${messageOf(error)}`,
        EXIT.failed,
        'Run this again; progress lives in the secrets themselves, so it resumes where it left off. Until it completes the builder still accepts the previous token, the safe direction to be interrupted in.'
      );
    }

    return {
      summary: `Builder token rolled over in ${environment}`,
      json: {
        environment,
        stageBefore: stage,
        stageAfter: current,
        builders: apps.builders,
        cms: apps.cms
      }
    };
  }
});
