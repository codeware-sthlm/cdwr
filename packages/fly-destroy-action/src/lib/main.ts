import * as core from '@actions/core';

import { flyDestroy } from './fly-destroy';
import { ActionInputsSchema } from './schemas/action-inputs.schema';

/**
 * Main action function
 */
export async function run(): Promise<void> {
  try {
    const inputs = ActionInputsSchema.parse({
      flyApiToken: core.getInput('fly-api-token'),
      flyTraceCli: core.getBooleanInput('fly-trace-cli'),
      flyConsoleLogs: core.getBooleanInput('fly-console-logs'),
      token: core.getInput('token', { required: true }),
      postgresCluster: core.getInput('postgres-cluster'),
      databaseName: core.getInput('database-name'),
      dryRun: core.getBooleanInput('dry-run')
    });

    core.debug(`Inputs:\n${JSON.stringify(inputs, null, 2)}`);

    const { destroyed, skipped, droppedDatabases, skippedDatabases } =
      await flyDestroy(inputs);

    core.setOutput('destroyed', destroyed);
    core.setOutput('skipped', skipped);
    core.setOutput('dropped-databases', droppedDatabases);
    core.setOutput('skipped-databases', skippedDatabases);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
