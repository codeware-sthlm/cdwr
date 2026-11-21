import * as core from '@actions/core';
import * as github from '@actions/github';
import { Fly } from '@cdwr/fly-node';
import { getDeployEnv, printGitHubContext } from '@codeware/shared/util/github';
import type {
  PullRequestEvent,
  WebhookEventName
} from '@octokit/webhooks-types';

import type { ActionInputs } from './schemas/action-inputs.schema';
import {
  type ActionOutputs,
  ActionOutputsSchema
} from './schemas/action-outputs.schema';
import { getBuildConfig } from './utils/get-build-config';
import { runBuildApps } from './utils/run-build-apps';

/**
 * Run fly build process
 *
 * @param inputs Build options
 */
export async function flyBuild(inputs: ActionInputs): Promise<ActionOutputs> {
  core.info('Starting fly build process');

  const {
    context: { eventName, payload, ref }
  } = github;
  const currentBranch = ref.split('/').at(-1);

  core.startGroup('GitHub context details');
  printGitHubContext();
  core.endGroup();

  core.startGroup('Get build configuration');
  const config = await getBuildConfig(inputs);
  core.endGroup();

  core.startGroup('Initialize Fly client');
  const fly = new Fly({
    token: config.fly.token,
    org: config.fly.org,
    logger: {
      info: (msg) => core.info(msg),
      error: (msg, params) => core.error(msg, params),
      traceCLI: config.fly.traceCLI,
      streamToConsole: config.fly.consoleLogs
    }
  });

  await fly.isReady('assert');
  core.info('Fly client is ready 🚀');
  core.endGroup();

  core.startGroup('Analyze event');
  core.info(
    `Get deployment environment for '${eventName}' on '${currentBranch}'`
  );

  let environment: ActionOutputs['environment'];
  let pullRequest: number | undefined;

  if (inputs.environment) {
    core.info(
      `Using environment '${inputs.environment}' from action input (manual override)`
    );
    environment = inputs.environment;
  } else {
    const deployEnv = getDeployEnv(github.context, config.mainBranch);
    if (deployEnv.environment) {
      environment = deployEnv.environment;
    } else {
      throw new Error(deployEnv.reason);
    }
  }

  core.info(`Using environment '${environment}'`);

  if (eventName === 'workflow_dispatch') {
    const prNumber = (payload as Partial<PullRequestEvent>)?.number;
    if (prNumber) {
      pullRequest = prNumber;
    }
  } else {
    switch (eventName as WebhookEventName) {
      case 'pull_request': {
        const { number } = payload as PullRequestEvent;
        pullRequest = number;
        break;
      }
      case 'push':
        break;
    }
  }

  // Explicit input wins; workflow_dispatch carries no usable PR
  if (inputs.prNumber) {
    pullRequest = inputs.prNumber;
  }

  if (environment === 'preview' && !pullRequest) {
    throw new Error(
      'A pull request number is required for preview builds. ' +
        'Provide the `pr-number` input when the triggering event carries no pull request.'
    );
  }
  core.endGroup();

  core.startGroup('Build Docker images for affected applications');
  const images = await runBuildApps({
    config,
    environment,
    fly,
    pullRequest
  });
  core.endGroup();

  return ActionOutputsSchema.parse({ environment, images });
}
