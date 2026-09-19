import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { environmentInput } from '../../services/environment';
import {
  fly,
  flyAppName,
  listPreviewCmsApps,
  setSecretsTogether,
  startMachines
} from '../../services/fly';
import { currentPullRequest } from '../../services/github';
import {
  type Environment,
  type TenantApp,
  deleteInfisicalSecret,
  readTenantDeployments,
  setInfisicalSecret
} from '../../services/infisical';

import {
  type AppState,
  GATE_KEY,
  MIN_PASSWORD_LENGTH,
  type OnFly,
  describeOnFly,
  generatePassword,
  prChoices,
  pullRequestChoices,
  targetFlyApp,
  tenantHint
} from './gate.logic';

/** Whether the deployed app carries the gate password; unreachable is reported rather than assumed open */
async function readFlyState(flyApp: string): Promise<OnFly> {
  try {
    const secrets = await fly().secrets.list({ app: flyApp });
    return secrets.some(({ name }) => name === GATE_KEY) ? 'set' : 'missing';
  } catch {
    return 'unreachable';
  }
}

/**
 * Template for a mutating command whose steps depend on state read from two
 * systems at once: it describes both places the gate lives before deciding
 * what changes, then applies Infisical first and Fly second either way.
 */
export default defineCommand({
  summary: "Open or close a tenant's site behind a shared password",
  description:
    'Infisical decides what the next deploy sets; the Fly secret decides what the running app does right now. Both are kept in step.',
  danger: 'mutate',
  confirm: 'always',
  needs: ['fly', 'infisical'],
  inputs: {
    action: input.enum(['open', 'close'] as const, {
      prompt: 'Open or close the site?',
      positional: true
    }),
    environment: environmentInput(),
    pullRequest: input.optional(
      input.select<string>({
        prompt: 'Which pull request?',
        description: 'Preview only; picks which deployment to gate',
        choices: async (ctx) => {
          const apps = await listPreviewCmsApps();
          const mine = await currentPullRequest(ctx.root);
          return prChoices(pullRequestChoices(apps, mine));
        }
      }),
      (r) => r['environment'] === 'preview'
    ),
    tenant: input.select<string>({
      prompt: 'Which tenant?',
      choices: async (ctx, resolved) => {
        const environment = resolved['environment'] as Environment;
        const deployments = await readTenantDeployments(environment);
        return [...deployments.entries()].map(([tenantId, apps]) => ({
          value: tenantId,
          hint: tenantHint(apps)
        }));
      }
    }),
    generate: input.boolean({
      prompt: 'Generate a password?',
      when: (r) => r['action'] === 'close'
    }),
    password: input.optional(
      input.secret({
        prompt: 'Password visitors will be given:',
        schema: z
          .string()
          .min(
            MIN_PASSWORD_LENGTH,
            `At least ${MIN_PASSWORD_LENGTH} characters — the cms refuses to start below that`
          )
      }),
      (r) => r['action'] === 'close' && !r['generate']
    )
  },

  async plan(ctx, { action, environment, pullRequest, tenant, password }) {
    const pr =
      pullRequest && pullRequest !== 'none' ? Number(pullRequest) : undefined;

    const deployments = await ctx.ui.task(
      `Reading tenants for ${environment} from Infisical`,
      () => readTenantDeployments(environment),
      (d) => `${d.size} tenant(s) found`
    );
    const apps: TenantApp[] = deployments.get(tenant) ?? [];

    const states = await ctx.ui.task(
      'Reading the running apps',
      () =>
        Promise.all(
          apps.map(async ({ app, secrets }): Promise<AppState> => {
            const flyApp = targetFlyApp(environment, pr, () =>
              flyAppName(ctx.root, app, tenant, pr)
            );
            return {
              app,
              secretPath: `/tenants/${tenant}/apps/${app}`,
              inInfisical: GATE_KEY in secrets,
              flyApp,
              onFly: flyApp ? await readFlyState(flyApp) : 'unreachable'
            };
          })
        ),
      (list) => `${list.length} app(s) read`
    );

    const value =
      action === 'close' ? (password ?? generatePassword()) : undefined;

    return {
      steps: states.map(
        ({ app, flyApp, onFly }) =>
          `${app}: ${describeOnFly(onFly)}${flyApp ? ` (${flyApp})` : ''}`
      ),
      notes: [
        action === 'close'
          ? 'Infisical is written first, so a redeploy cannot reopen the site, then the running apps.'
          : 'Infisical is cleared first, then the running apps, for the same reason.'
      ],
      target: { environment, name: tenant },
      data: { action, environment, tenant, states, value }
    };
  },

  async apply(ctx, { action, environment, tenant, states, value }) {
    if (action === 'open') {
      for (const { secretPath } of states) {
        await ctx.ui.task(
          `Clearing ${secretPath}`,
          () =>
            deleteInfisicalSecret({
              environment,
              path: secretPath,
              key: GATE_KEY
            }),
          (deleted) => (deleted ? 'cleared' : 'held no password')
        );
      }

      const failed: string[] = [];
      for (const { flyApp } of states.filter(({ onFly }) => onFly === 'set')) {
        try {
          await ctx.ui.task(`Opening ${flyApp}`, async () => {
            await startMachines(flyApp);
            await fly().secrets.unset(GATE_KEY, { app: flyApp });
          });
        } catch (error) {
          ctx.ui.warn(`${flyApp} is still closed: ${messageOf(error)}`);
          failed.push(flyApp);
        }
      }

      if (failed.length) {
        return {
          summary: `${tenant} in ${environment} is only partly open`,
          partial: true,
          next: failed.map(
            (app) => `fly secrets unset ${GATE_KEY} --app ${app}`
          ),
          json: { tenant, environment, failed }
        };
      }
      return {
        summary: `${tenant} is open in ${environment}`,
        json: { tenant, environment }
      };
    }

    // action === 'close'
    for (const { secretPath } of states) {
      await ctx.ui.task(`Writing ${secretPath}`, () =>
        setInfisicalSecret({
          environment,
          path: secretPath,
          key: GATE_KEY,
          value: value as string
        })
      );
    }

    const live = states
      .filter(({ onFly }) => onFly !== 'unreachable')
      .map(({ flyApp }) => flyApp);

    try {
      for (const flyApp of live) {
        await ctx.ui.task(`Waking ${flyApp}`, () => startMachines(flyApp));
      }
      await ctx.ui.task(
        `Closing ${live.join(', ')}`,
        () =>
          setSecretsTogether(
            live,
            { [GATE_KEY]: value as string },
            (app, phase) =>
              ctx.ui.info(
                `${phase === 'stage' ? 'Staged on' : 'Applied on'} ${app}`
              )
          ),
        () => `Closed ${live.join(', ')}`
      );
    } catch (error) {
      ctx.ui.note(
        [
          `Password: ${value}`,
          '',
          `Infisical holds it, but not every app has taken it up yet:`,
          messageOf(error)
        ],
        'Staging incomplete'
      );
      return {
        summary: `${tenant} in ${environment} is only partly closed`,
        partial: true,
        next: live.map(
          (app) =>
            `fly secrets set ${GATE_KEY}=${value} --app ${app} && fly secrets deploy --app ${app}`
        ),
        json: { tenant, environment, password: value }
      };
    }

    ctx.ui.note(
      [
        `Password: ${value}`,
        '',
        `Shown once. Anyone who has it can read the site; everyone else meets`,
        `the gate. Setting a new one here logs out every visitor holding a`,
        `cookie, since the cookie is signed with the password.`
      ],
      'Share this with whoever should see the site'
    );

    return {
      summary: `${tenant} is closed in ${environment}`,
      json: { tenant, environment, password: value }
    };
  }
});
