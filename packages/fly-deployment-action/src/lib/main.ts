import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as core from '@actions/core';
import { maskSecretsIn, redactConfig } from '@codeware/shared/util/github';

import { flyDeployment } from './fly-deployment';
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
    let appDetails = {};
    try {
      appDetails = appDetailsInput ? JSON.parse(appDetailsInput) : {};
    } catch {
      // The parser's message quotes the input, which a stale caller may have
      // filled with tenant secret values
      throw new Error('app-details is not valid JSON');
    }

    // Prefer images-path over images to avoid GitHub Actions secret scanning
    // suppressing the images job output when it matches a registered secret pattern.
    const imagesPathInput = core.getInput('images-path');
    const imagesInput = core.getInput('images');
    let images: Record<string, string> | undefined;
    if (imagesPathInput) {
      images = JSON.parse(readFileSync(imagesPathInput, 'utf-8'));
    } else if (imagesInput) {
      images = JSON.parse(imagesInput);
    }

    const inputs = ActionInputsSchema.parse({
      apps: JSON.parse(core.getInput('apps') || '[]'),
      env: core.getMultilineInput('env'),
      environment: core.getInput('environment') as ActionInputs['environment'],
      flyApiToken: core.getInput('fly-api-token'),
      flyOrg: core.getInput('fly-org'),
      flyRegion: core.getInput('fly-region'),
      flyTraceCli: core.getBooleanInput('fly-trace-cli'),
      flyConsoleLogs: core.getBooleanInput('fly-console-logs'),
      images,
      infisicalClientId: core.getInput('infisical-client-id') || undefined,
      infisicalClientSecret:
        core.getInput('infisical-client-secret') || undefined,
      infisicalProjectId: core.getInput('infisical-project-id') || undefined,
      infisicalSite: (core.getInput('infisical-site') ||
        undefined) as ActionInputs['infisicalSite'],
      optOutDepotBuilder: core.getBooleanInput('opt-out-depot-builder'),
      prNumber: parsePrNumber(core.getInput('pr-number')),
      secrets: core.getMultilineInput('secrets'),
      appDetails,
      token: core.getInput('token', { required: true })
    } satisfies ActionInputs);

    maskSecretsIn(inputs);
    core.debug(`Inputs:\n${JSON.stringify(redactConfig(inputs), null, 2)}`);

    const { environment, projects } = await flyDeployment(inputs);

    core.info(
      `Set outputs from response\n${JSON.stringify(projects, null, 2)}`
    );

    core.setOutput('environment', environment);
    core.setOutput(
      'failed',
      projects.filter((p) => p.action === 'failed').map((p) => p.appOrProject)
    );
    core.setOutput(
      'deployed',
      projects
        .filter((p) => p.action === 'deploy')
        .reduce((acc, p) => ({ ...acc, [`${p.name}`]: p.url }), {})
    );
    // Nx project names, deduplicated — a multi-tenant app deploys once per
    // tenant but is released once. `deployed` is keyed by display label, so it
    // cannot be used for anything that needs to match a project.
    core.setOutput(
      'deployed-projects',
      JSON.stringify([
        ...new Set(
          projects
            .filter((p) => p.action === 'deploy')
            .map((p) => p.projectName)
        )
      ])
    );
    core.setOutput('projects', JSON.stringify(projects));

    // Write projects to a file for artifact-based transfer — job outputs containing
    // Fly.io URLs can be suppressed by GitHub Actions secret scanning.
    const projectsPath = join(
      process.env['RUNNER_TEMP'] || tmpdir(),
      'fly-projects.json'
    );
    writeFileSync(projectsPath, JSON.stringify(projects));
    core.setOutput('projects-path', projectsPath);

    const failedProjects = projects.filter((p) => p.action === 'failed');
    if (failedProjects.length > 0) {
      const failedList = failedProjects
        .map(
          (p) =>
            `${p.appOrProject}: ${'error' in p ? p.error : 'Unknown error'}`
        )
        .join('\n');
      core.setFailed(
        `Deployment failed for ${failedProjects.length} project(s):\n${failedList}`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
