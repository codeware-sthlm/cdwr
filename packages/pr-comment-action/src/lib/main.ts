import { existsSync, readFileSync } from 'node:fs';

import * as core from '@actions/core';
import { maskSecretsIn, redactConfig } from '@codeware/shared/util/github';

import { flyPrComment } from './fly-pr-comment';
import { ActionInputsSchema } from './schemas/action-inputs.schema';

/**
 * Main action function
 */
export async function run(): Promise<void> {
  try {
    const deployedInput = core.getInput('deployed');
    const failedInput = core.getInput('failed');
    const projectsPathInput = core.getInput('projects-path');
    const projectsInput = core.getInput('projects');

    // Prefer file-based projects (avoids GitHub Actions secret scanning suppression)
    let projectsParsed: unknown;
    if (projectsPathInput && existsSync(projectsPathInput)) {
      projectsParsed = JSON.parse(readFileSync(projectsPathInput, 'utf-8'));
    } else if (projectsInput) {
      projectsParsed = JSON.parse(projectsInput);
    }

    const changelogsPathInput = core.getInput('changelogs-path');
    const changelogsParsed =
      changelogsPathInput && existsSync(changelogsPathInput)
        ? JSON.parse(readFileSync(changelogsPathInput, 'utf-8'))
        : undefined;

    const inputs = ActionInputsSchema.parse({
      pullRequest: Number(core.getInput('pull-request', { required: true })),
      environment: core.getInput('environment', { required: true }),
      deployed: deployedInput ? JSON.parse(deployedInput) : undefined,
      failed: failedInput ? JSON.parse(failedInput) : undefined,
      projects: projectsParsed,
      changelogs: changelogsParsed,
      token: core.getInput('token', { required: true })
    });

    maskSecretsIn(inputs);
    core.debug(`Inputs:\n${JSON.stringify(redactConfig(inputs), null, 2)}`);

    await flyPrComment(inputs);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
