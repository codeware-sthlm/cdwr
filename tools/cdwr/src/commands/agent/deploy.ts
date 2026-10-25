import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { CommandError, run, sleep } from '../../services/shell';

import {
  COMPOSE_SOURCE,
  DEFAULT_WAIT_MINUTES,
  IMAGE_WORKFLOW,
  IMPLEMENT_LOCK,
  PAUSED,
  REMOTE_COMPOSE,
  REMOTE_IMAGE_ENV,
  RUN_LOCK,
  type Remote,
  assertHost,
  assertTag,
  headShaOf,
  isPid,
  isRunning,
  lockOld,
  lockPid,
  parseReport,
  parseRunning,
  pathExists,
  pause,
  pidAlive,
  pull,
  report,
  tagFromSha,
  unpause,
  up,
  uploadCompose,
  waitPlan,
  writeTag
} from './deploy.logic';

const REPO = 'codeware-sthlm/cdwr';

const ssh = (remote: Remote) =>
  run('ssh', remote.args, { input: remote.input });

/** The exit-code question `test -e` or `docker inspect` answers: true on 0, false on 1, an error otherwise */
async function succeeds(remote: Remote): Promise<boolean> {
  try {
    await ssh(remote);
    return true;
  } catch (error) {
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

async function running(host: string): Promise<boolean> {
  try {
    return parseRunning((await ssh(isRunning(host))).stdout);
  } catch (error) {
    // No container yet
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

/** An implement.lock is busy while its session lives; mirrors how run.sh clears a stale one */
async function implementing(host: string): Promise<boolean> {
  if (!(await succeeds(pathExists(host, IMPLEMENT_LOCK)))) return false;
  let owner = '';
  try {
    owner = (await ssh(lockPid(host, IMPLEMENT_LOCK))).stdout.trim();
  } catch (error) {
    if (!(error instanceof CommandError && error.code === 1)) throw error;
  }
  if (isPid(owner)) return succeeds(pidAlive(host, owner));
  // No pid yet: the owner may be between mkdir and write, so only an old lock is stale
  const old = (await ssh(lockOld(host, IMPLEMENT_LOCK))).stdout.trim();
  return old === '';
}

async function busy(host: string): Promise<boolean> {
  if (await succeeds(pathExists(host, RUN_LOCK))) return true;
  return implementing(host);
}

async function latestImageTag(): Promise<string> {
  const { stdout } = await run('gh', [
    'api',
    `repos/${REPO}/actions/workflows/${IMAGE_WORKFLOW}/runs?branch=main&status=success&per_page=1`,
    '--jq',
    '.workflow_runs[0].head_sha'
  ]);
  const sha = headShaOf(stdout);
  if (!sha) {
    throw new CliError(
      'No successful image build found on main',
      EXIT.failed,
      'Pass --tag sha-<7 hex characters>'
    );
  }
  return tagFromSha(sha);
}

export default defineCommand({
  summary: 'Update the agent container on a host to a new image',
  description:
    'Over ssh: ships the compose file, waits for the queue to be idle, pulls the image and restarts the container. Without --tag the latest successful image build on main is used.',
  danger: 'mutate',
  needs: ['gh'],
  inputs: {
    host: input.string({
      prompt: 'Which host?',
      short: 'H',
      description: 'ssh name of the host, such as its Tailscale name'
    }),
    tag: input.string({
      prompt: 'Which image tag?',
      short: 't',
      description:
        'sha-<7 hex characters> or main; the latest image build on main when left out',
      default: ''
    }),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    })
  },

  async plan(ctx, { host, tag, wait }) {
    assertHost(host);
    const resolved = tag
      ? assertTag(tag)
      : await ctx.ui.task(
          'Finding the latest image build',
          latestImageTag,
          (t) => `Latest image build: ${t}`
        );
    const compose = readFileSync(join(ctx.root, COMPOSE_SOURCE), 'utf8');
    return {
      steps: [
        {
          label: 'Pause the queue and wait for it to be idle',
          detail: `up to ${wait} minutes, only when the container runs`
        },
        {
          label: 'Upload the compose file',
          detail: `${host}:${REMOTE_COMPOSE}`
        },
        {
          label: 'Set the image tag',
          detail: `${resolved} in ${REMOTE_IMAGE_ENV}`
        },
        { label: 'Pull the image' },
        { label: 'Restart the container' },
        { label: 'Resume the queue and report the image' }
      ],
      target: { name: host },
      data: { host, tag: resolved, compose, wait }
    };
  },

  async apply(ctx: Context, { host, tag, compose, wait }) {
    const runs = await running(host);
    // A pause the user set stays; only one made here is lifted again
    const alreadyPaused = runs && (await succeeds(pathExists(host, PAUSED)));
    const created = runs && !alreadyPaused;
    if (created) await ssh(pause(host));

    const failed = (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      return new CliError(
        `Deploy of ${tag} failed: ${reason}`,
        EXIT.failed,
        `Run the same deploy again, or pass --tag with the previous tag${created ? '; the queue was resumed' : ''}`
      );
    };
    // Only a pause made here is lifted again
    const lift = async () => {
      if (created) await ssh(unpause(host)).catch(() => undefined);
    };

    if (runs) {
      const { intervalMs, checks } = waitPlan(wait);
      let idle: boolean;
      try {
        idle = await ctx.ui.task(
          'Waiting for the queue to be idle',
          async () => {
            for (let i = 0; i < checks; i++) {
              if (i > 0) await sleep(intervalMs);
              if (!(await busy(host))) return true;
            }
            return false;
          },
          (ok) => (ok ? 'The queue is idle' : 'The queue stayed busy')
        );
      } catch (error) {
        await lift();
        throw failed(error);
      }
      if (!idle) {
        await lift();
        throw new CliError(
          `The queue was still busy after ${wait} minutes; nothing was changed`,
          EXIT.failed,
          'Try again later, or raise --wait'
        );
      }
    }

    try {
      await ctx.ui.task(
        'Uploading the compose file',
        () => ssh(uploadCompose(host, compose)),
        () => 'Compose file uploaded'
      );
      await ssh(writeTag(host, tag));
      await ctx.ui.task(
        `Pulling ${tag}`,
        () => ssh(pull(host)),
        () => `Pulled ${tag}`
      );
      await ctx.ui.task(
        'Restarting the container',
        () => ssh(up(host)),
        () => 'Container restarted'
      );
    } catch (error) {
      // The old container if up never ran, else the new one; either way the queue must not stay paused
      await lift();
      throw failed(error);
    }

    let resumed = !created;
    // The new container reads the volume's paused file as it started
    for (let attempt = 0; created && !resumed && attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2000);
      resumed = await succeeds(unpause(host)).catch(() => false);
    }

    const { image, state } = parseReport((await ssh(report(host))).stdout);
    const stuck = !resumed;
    return {
      summary: `Deployed ${tag} to ${host}`,
      details: [
        `Image ${image}`,
        `State ${state}`,
        ...(alreadyPaused
          ? ['The queue was already paused and stays paused']
          : [])
      ],
      next: stuck
        ? [
            `Resume the queue: remove ${PAUSED} in the container, or \`cdwr agent resume\` there`
          ]
        : undefined,
      partial: state !== 'running' || stuck,
      json: { host, tag, image, state, resumed: created && resumed }
    };
  }
});
