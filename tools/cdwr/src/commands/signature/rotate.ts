import { defineCommand } from '../../cli/command';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { environmentInput } from '../../services/environment';
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

import {
  ACTIVE,
  type AffectedApps,
  PREVIOUS,
  SECRET_PATH,
  type Stage,
  classifyApps,
  deriveStage,
  generateSecret,
  remainingSteps
} from './rotate.logic';

async function readState(
  environment: Environment
): Promise<{ stage: Stage; active: string }> {
  const secrets = await readSecrets(environment, SECRET_PATH);
  const stage = deriveStage(secrets[ACTIVE], secrets[PREVIOUS]);
  return { stage, active: secrets[ACTIVE] as string };
}

async function fetchAffectedApps(
  root: string,
  environment: Environment
): Promise<AffectedApps> {
  const names = await listAppNames();
  return classifyApps(
    names,
    configAppName(root, 'cms'),
    configAppName(root, 'web'),
    environment
  );
}

/**
 * The whole rollover runs in one go, restarting apps between steps. cms
 * accepts both secrets throughout, so nothing is rejected while web is
 * catching up - the secret is read from Infisical at boot, so restarting is
 * all it takes, no redeploy.
 */
export default defineCommand({
  summary: 'Roll over the request signature secret, step by step',
  description:
    'Stages the current secret as the previous one, replaces the active secret, then retires the previous one, restarting the affected apps between steps.',
  danger: 'destructive',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput()
  },

  async plan(ctx, { environment }) {
    const { stage, active } = await ctx.ui.task(
      `Reading ${SECRET_PATH} for ${environment}`,
      () => readState(environment),
      (s) =>
        s.stage === 'not-started'
          ? 'Nothing staged yet'
          : `Resuming a rollover already at '${s.stage}'`
    );

    const apps = await ctx.ui.task(
      'Finding apps that use the signature secret',
      () => fetchAffectedApps(ctx.root, environment),
      (a) => `${a.verifiers.length} verifier(s), ${a.signers.length} signer(s)`
    );

    if (!apps.verifiers.length || !apps.signers.length) {
      throw new Error(
        `Expected both cms and web apps in ${environment}, found ` +
          `verifiers=[${apps.verifiers.join(', ')}] signers=[${apps.signers.join(', ')}]`
      );
    }

    return {
      steps: remainingSteps(stage),
      notes: [
        `verifiers: ${apps.verifiers.join(', ')}`,
        `signers:   ${apps.signers.join(', ')}`
      ],
      target: { environment, name: 'signature' },
      data: { environment, stage, active, apps }
    };
  },

  async apply(ctx, { environment, stage, active, apps }) {
    // A probe write, so it belongs here and not in the plan
    await ctx.ui.task('Checking Infisical accepts writes', () =>
      assertWritable(environment, SECRET_PATH)
    );

    const restartAll = async (names: string[]) => {
      for (const app of names) {
        await ctx.ui.task(`Restarting ${app}`, () => restartMachines(app));
      }
    };

    let current = stage;
    try {
      // Step 1 - cms starts accepting the current secret as the previous one,
      // so it keeps working once the active one changes underneath it
      if (current === 'not-started') {
        await ctx.ui.task(`Staging ${PREVIOUS}`, () =>
          setInfisicalSecret({
            environment,
            path: SECRET_PATH,
            key: PREVIOUS,
            value: active
          })
        );
        await restartAll(apps.verifiers);
        current = 'previous-staged';
      }

      // Step 2 - the new secret; cms has to know it before web signs with it,
      // hence verifiers first
      if (current === 'previous-staged') {
        await ctx.ui.task(`Generating a new ${ACTIVE}`, () =>
          setInfisicalSecret({
            environment,
            path: SECRET_PATH,
            key: ACTIVE,
            value: generateSecret()
          })
        );
        await restartAll(apps.verifiers);
        await restartAll(apps.signers);
        current = 'rolling-over';
      }

      // Step 3 - only the new secret is accepted from here
      if (current === 'rolling-over') {
        await ctx.ui.task(`Retiring ${PREVIOUS}`, () =>
          deleteInfisicalSecret({
            environment,
            path: SECRET_PATH,
            key: PREVIOUS
          })
        );
        await restartAll(apps.verifiers);
      }
    } catch (error) {
      throw new CliError(
        `Rollover interrupted at '${current}': ${messageOf(error)}`,
        EXIT.failed,
        'Run this again; progress lives in the secrets themselves, so it resumes where it left off. Until it completes cms may still accept the previous secret, the safe direction to be interrupted in.'
      );
    }

    return {
      summary: `Signature secret rolled over in ${environment}`,
      json: { environment, verifiers: apps.verifiers, signers: apps.signers }
    };
  }
});
