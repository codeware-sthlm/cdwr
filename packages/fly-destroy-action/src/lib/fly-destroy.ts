import * as core from '@actions/core';
import { Fly } from '@cdwr/fly-node';
import { printGitHubContext } from '@codeware/shared/util/github';

import type { ActionInputs } from './schemas/action-inputs.schema';
import {
  type ActionOutputs,
  ActionOutputsSchema
} from './schemas/action-outputs.schema';
import { runDestroyApps } from './utils/run-destroy-apps';
import {
  reportVolumeUsage,
  runDestroyDatabases
} from './utils/run-destroy-databases';

/**
 * Run fly destroy process for deprecated preview applications.
 *
 * @param inputs Destroy options
 */
export async function flyDestroy(inputs: ActionInputs): Promise<ActionOutputs> {
  core.info('Starting fly destroy process');

  core.startGroup('GitHub context details');
  printGitHubContext();
  core.endGroup();

  core.startGroup('Initialize Fly client');
  const fly = new Fly({
    token: inputs.flyApiToken || process.env['FLY_API_TOKEN'] || '',
    logger: {
      info: (msg) => core.info(msg),
      error: (msg, params) => core.error(msg, params),
      traceCLI: inputs.flyTraceCli ?? false,
      streamToConsole: inputs.flyConsoleLogs ?? false
    }
  });

  await fly.isReady('assert');
  core.info('Fly client is ready 🚀');
  core.endGroup();

  // An app sweep failure must not keep the databases from being swept;
  // it fails the action once both phases have run
  let appsError: unknown;
  let destroyed: string[] = [];
  let skipped: string[] = [];

  core.startGroup('Destroy deprecated applications');
  try {
    ({ destroyed, skipped } = await runDestroyApps(
      inputs.token,
      fly,
      inputs.dryRun
    ));
  } catch (error) {
    appsError = error;
  }
  core.endGroup();

  let droppedDatabases: string[] = [];
  let skippedDatabases: string[] = [];

  core.startGroup('Destroy deprecated preview databases');
  if (inputs.postgresCluster && inputs.databaseName) {
    await reportVolumeUsage(fly, inputs.postgresCluster);
    ({ dropped: droppedDatabases, skipped: skippedDatabases } =
      await runDestroyDatabases(inputs.token, fly, {
        cluster: inputs.postgresCluster,
        template: inputs.databaseName,
        dryRun: inputs.dryRun
      }));
  } else {
    core.info('No postgres cluster configured, skip databases');
  }
  core.endGroup();

  if (appsError) {
    throw appsError;
  }

  return ActionOutputsSchema.parse({
    destroyed,
    skipped,
    droppedDatabases,
    skippedDatabases
  });
}
