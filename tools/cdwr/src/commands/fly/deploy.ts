import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { DEPLOYED, environmentInput } from '../../services/environment';
import {
  currentPullRequest,
  listWorkflowRuns,
  pullRequestBranch,
  runWorkflow
} from '../../services/github';

import {
  DEPLOY_WORKFLOW,
  PRODUCTION_REF,
  deploymentLabel,
  dispatchInputs,
  findStartedRun,
  releaseGroupApps,
  resolvePullRequest
} from './deploy.logic';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default defineCommand({
  summary: 'Deploy an app to Fly through the deployment workflow',
  description:
    'Dispatches the Fly Deployment workflow. Preview needs a pull request and runs from its branch, so an app the pull request did not change can still be deployed to it. Production runs from main.',
  danger: 'mutate',
  confirm: 'always',
  needs: ['gh'],
  inputs: {
    app: input.select<string>({
      prompt: 'Which app?',
      description: 'App of the apps release group in nx.json',
      positional: true,
      remember: true,
      choices: (ctx) =>
        releaseGroupApps(
          JSON.parse(readFileSync(join(ctx.root, 'nx.json'), 'utf8'))
        ).map((value) => ({ value }))
    }),
    environment: environmentInput(DEPLOYED, {
      description: 'preview needs a pull request'
    }),
    pr: input.optional(
      input.number({
        prompt: 'Which pull request?',
        description:
          'Preview only; defaults to the pull request of the current branch',
        flagOnly: true
      }),
      (r) => r['environment'] === 'preview'
    ),
    tenant: input.string({
      prompt: 'Which tenant?',
      description: 'Only that tenant; every tenant of the app by default',
      flagOnly: true,
      default: ''
    })
  },

  async plan(ctx, { app, environment, pr, tenant }) {
    const pullRequest = resolvePullRequest(
      environment,
      pr,
      pr === undefined && environment === 'preview'
        ? await currentPullRequest(ctx.root)
        : undefined
    );
    const deployment = {
      app,
      environment,
      pr: pullRequest,
      tenant: tenant || undefined
    };
    const ref =
      pullRequest === undefined
        ? PRODUCTION_REF
        : await pullRequestBranch(ctx.root, pullRequest).catch(() => {
            throw new CliError(`Could not read the branch of #${pullRequest}`);
          });

    return {
      steps: [{ label: deploymentLabel(deployment), detail: `from ${ref}` }],
      target: { environment, name: app },
      data: { ...deployment, ref }
    };
  },

  async apply(ctx, { ref, ...deployment }) {
    const list = () => listWorkflowRuns(ctx.root, DEPLOY_WORKFLOW, ref, 20);
    const known = new Set((await list().catch(() => [])).map(({ id }) => id));

    await ctx.ui.task(
      'Dispatching the workflow',
      () =>
        runWorkflow(ctx.root, DEPLOY_WORKFLOW, ref, dispatchInputs(deployment)),
      () => 'Workflow dispatched'
    );

    const run = await ctx.ui.task('Finding the run', () =>
      findStartedRun(list, known, sleep)
    );
    const runUrl = run?.url;

    return {
      summary: runUrl
        ? `Deployment of ${deployment.app} started: ${runUrl}`
        : `Deployment of ${deployment.app} dispatched`,
      next: runUrl
        ? []
        : [
            `Find the run: gh run list --workflow ${DEPLOY_WORKFLOW} --branch ${ref}`
          ],
      json: { ...deployment, ref, runUrl }
    };
  }
});
