import * as core from '@actions/core';
import * as github from '@actions/github';
import { Fly } from '@cdwr/fly-node';
import { printGitHubContext } from '@codeware/shared/util/github';
import type {
  PullRequestEvent,
  WebhookEventName
} from '@octokit/webhooks-types';

import { type ActionInputs } from './schemas/action-inputs.schema';
import { ActionOutputsSchema } from './schemas/action-outputs.schema';
import { type ActionOutputs } from './schemas/action-outputs.schema';
import { type BuildingContext, ContextSchema } from './schemas/context.schema';
import { getDeploymentConfig } from './utils/get-deployment-config';
import { runDeployApps } from './utils/run-deploy-apps';

/**
 * Run fly deployment process
 *
 * @param inputs Deployment options
 * @param throwOnError Whether to throw on error (default: true)
 */
export async function flyDeployment(
  inputs: ActionInputs,
  throwOnError = true
): Promise<ActionOutputs> {
  try {
    core.info('Starting fly deployment process');

    const context: BuildingContext = {};

    const {
      context: { eventName, payload }
    } = github;

    core.startGroup('GitHub context details');
    printGitHubContext();
    core.endGroup();

    core.startGroup('Get deployment configuration');
    const config = getDeploymentConfig(inputs);
    core.endGroup();

    core.startGroup('Initialize Fly client');
    const fly = new Fly({
      token: config.fly.token,
      org: config.fly.org,
      region: config.fly.region,
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
    context.environment = inputs.environment;
    core.info(`Using environment '${context.environment}'`);

    if (eventName === 'workflow_dispatch') {
      context.action = 'deploy';

      const prNumber = (payload as Partial<PullRequestEvent>)?.number;
      if (prNumber) {
        context.pullRequest = prNumber;
      }
    } else {
      switch (eventName as WebhookEventName) {
        case 'pull_request':
          {
            const { number } = payload as PullRequestEvent;
            context.action = 'deploy';
            context.pullRequest = number;
          }
          break;

        case 'push':
          context.action = 'deploy';
          break;
      }
    }

    // Explicit input wins; workflow_dispatch payloads carry no PR
    if (inputs.prNumber) {
      context.pullRequest = inputs.prNumber;
    }

    if (context.environment === 'preview' && !context.pullRequest) {
      throw new Error(
        'A pull request number is required for preview deployments. ' +
          'Provide the `pr-number` input when the triggering event carries no pull request.'
      );
    }
    core.endGroup();

    ContextSchema.parse(context);

    const results: ActionOutputs = {
      environment: context.environment,
      projects: []
    };

    core.startGroup('Deploy affected applications');
    results.projects = await runDeployApps({
      config,
      environment: context.environment,
      fly,
      imageMap: inputs.images,
      pullRequest: context.pullRequest
    });
    core.endGroup();

    return ActionOutputsSchema.parse(results);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);

      if (throwOnError) {
        throw error;
      }
    }

    return ActionOutputsSchema.parse({
      environment: null,
      projects: []
    });
  }
}
