import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as core from '@actions/core';
import { maskSecretsIn, redactConfig } from '@codeware/shared/util/github';

import { flyBuild } from './fly-build';
import {
  type ActionInputs,
  ActionInputsSchema
} from './schemas/action-inputs.schema';

/** Treat anything that isn't a positive integer as absent */
const parsePrNumber = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Main action function
 */
export async function run(): Promise<void> {
  try {
    const appDetailsInput = core.getInput('app-details');
    const appDetails = appDetailsInput ? JSON.parse(appDetailsInput) : {};

    const inputs = ActionInputsSchema.parse({
      apps: JSON.parse(core.getInput('apps') || '[]'),
      buildArgs: core.getMultilineInput('build-args'),
      environment: (core.getInput('environment') ||
        undefined) as ActionInputs['environment'],
      flyApiToken: core.getInput('fly-api-token'),
      flyOrg: core.getInput('fly-org'),
      flyTraceCli: core.getBooleanInput('fly-trace-cli'),
      flyConsoleLogs: core.getBooleanInput('fly-console-logs'),
      mainBranch: core.getInput('main-branch'),
      optOutDepotBuilder: core.getBooleanInput('opt-out-depot-builder'),
      prNumber: parsePrNumber(core.getInput('pr-number')),
      appDetails,
      token: core.getInput('token', { required: true })
    } satisfies ActionInputs);

    maskSecretsIn(inputs);
    core.debug(`Inputs:\n${JSON.stringify(redactConfig(inputs), null, 2)}`);

    const { environment, images } = await flyBuild(inputs);

    // Write images to a temp file — GitHub Actions secret scanning suppresses
    // job outputs that match registered secret patterns, which can happen with
    // Fly registry image references. Reading from a file inside the action
    // process bypasses this scanning entirely.
    const imagesFilePath = join(
      process.env['RUNNER_TEMP'] ?? process.env['TMPDIR'] ?? '/tmp',
      'fly-built-images.json'
    );
    writeFileSync(imagesFilePath, JSON.stringify(images));

    core.setOutput('environment', environment);
    core.setOutput('images-path', imagesFilePath);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
