import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as core from '@actions/core';

import { nxChangelog } from './nx-changelog';
import { ActionInputsSchema } from './schemas/action-inputs.schema';

/**
 * Nx project names that deployed, from the deployment action's
 * `deployed-projects` output.
 *
 * Never take these from its `deployed` map — those keys are display labels
 * (`project (tenant)` when tenant-scoped) and will not match a project name.
 */
const parseReleased = (raw: string): Array<string> => {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      '`released` must be a JSON array of project names — pass the deployment ' +
        "action's `deployed-projects` output, not `deployed`"
    );
  }
  return parsed;
};

/**
 * Main action function
 */
export async function run(): Promise<void> {
  try {
    const inputs = ActionInputsSchema.parse({
      apps: JSON.parse(core.getInput('apps', { required: true })),
      released: parseReleased(core.getInput('released', { required: true })),
      createRelease: core.getBooleanInput('create-release'),
      token: core.getInput('token', { required: true })
    });

    core.debug(`Inputs:\n${JSON.stringify(inputs, null, 2)}`);

    const { changelogs, failedReleases } = await nxChangelog(inputs);

    const changelogsPath = join(
      process.env['RUNNER_TEMP'] || tmpdir(),
      'nx-changelogs.json'
    );
    writeFileSync(changelogsPath, JSON.stringify(changelogs));

    core.setOutput('changelogs', JSON.stringify(changelogs));
    core.setOutput('changelogs-path', changelogsPath);
    core.setOutput('failed-releases', JSON.stringify(failedReleases));

    if (failedReleases.length > 0) {
      await core.summary
        .addHeading('GitHub releases not created', 3)
        .addList(failedReleases)
        .write();
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
