import { existsSync, mkdirSync, rmSync, rmdirSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  currentUid,
  jobState,
  paths,
  readText,
  requireHost,
  worktreeOf
} from '../../services/agent-queue';
import { run } from '../../services/shell';

import { serviceTarget } from './agent.logic';
import { rmLockCommand } from './status.logic';

/** Whether a detached implementing session holds `implement.lock`; one that has not written its pid yet is just starting */
function implementingAlive(lock: string): boolean {
  if (!existsSync(lock)) return false;
  const pid = Number(readText(`${lock}/pid`)?.trim());
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export default defineCommand({
  summary: 'Remove the scheduled planner from this machine',
  description:
    'Unloads the launchd job and removes its plist. The session side stays: sessions, the heartbeat mirror, the notify level, the pause flag, logs and spend under ~/.cdwr/agent-queue, the Keychain key and the installed scripts.',
  danger: 'mutate',
  confirm: 'always',
  inputs: {
    worktreeRemove: input.boolean({
      flag: 'worktree-remove',
      short: 'W',
      prompt: 'Remove the planner checkout too?',
      description:
        'Also remove the checkout the queue planned in, with `git worktree remove`; a checkout with changes is left in place',
      default: false,
      flagOnly: true
    })
  },

  async plan(ctx, { worktreeRemove }) {
    const host = requireHost(['launchd'], ctx.env);
    const job = await jobState();
    // bootout would kill a session halfway through a plan
    if (job.loaded && job.running) {
      throw new CliError(
        'A planning run is in progress',
        undefined,
        'Uninstall again once `cdwr agent status` shows it finished'
      );
    }

    const queue = paths(ctx.env);
    // A planning run holds queue.lock only while it runs; one left behind blocks the apply
    if (existsSync(queue.lock)) {
      throw new CliError(
        'A stale queue lock is left behind',
        undefined,
        `Remove it with \`${rmLockCommand(queue.lock, undefined)}\`, then uninstall again`
      );
    }
    const checkout = worktreeOf(ctx);
    const work = {
      unload: job.loaded,
      plist: existsSync(queue.plist),
      checkout: worktreeRemove && existsSync(checkout)
    };
    if (work.checkout && implementingAlive(queue.implementLock)) {
      throw new CliError(
        'An implementing session is running in the planner checkout',
        undefined,
        'Wait for it to finish or stop it, then uninstall again'
      );
    }
    const data = { host, queue, work, checkout, uid: currentUid() };

    const steps = [
      work.unload && {
        label: 'Unload the launchd job',
        detail: serviceTarget(data.uid)
      },
      work.plist && { label: 'Remove the launchd job', detail: queue.plist },
      work.checkout && {
        label: `Remove the planner checkout ${checkout}`,
        detail: 'git worktree remove, without --force'
      }
    ].filter((step) => step !== false);
    if (steps.length === 0) {
      return { steps, nothing: 'No launchd job is installed', data };
    }

    const notes = [
      'Kept: ~/.cdwr/agent-queue/ (sessions, mirror, notify level, pause flag, logs, spend), the Keychain key and the installed scripts'
    ];
    if (!worktreeRemove && existsSync(checkout)) {
      notes.push(`${checkout} stays; \`--worktree-remove\` takes it`);
    }
    return { steps, notes, data };
  },

  async apply(ctx, data) {
    const { queue, work, checkout } = data;

    let checkoutLeft = false;
    if (work.unload || work.plist || work.checkout) {
      // The runner's own lock: bootout can't kill a run that started since the plan
      mkdirSync(queue.home, { recursive: true });
      try {
        mkdirSync(queue.lock);
      } catch {
        throw new CliError(
          'A planning run or a check holds the queue lock',
          undefined,
          `Try again once \`cdwr agent status\` shows no run in progress; a stale lock is cleared with \`${rmLockCommand(queue.lock, undefined)}\``
        );
      }
      try {
        if (work.unload) {
          await run('launchctl', ['bootout', serviceTarget(data.uid)]);
          ctx.ui.success(`Unloaded ${serviceTarget(data.uid)}`);
        }
        if (work.plist) {
          rmSync(queue.plist, { force: true });
          ctx.ui.info(`Removed ${queue.plist}`);
        }
        if (work.checkout) {
          // A session may have started since the plan
          if (implementingAlive(queue.implementLock)) {
            checkoutLeft = true;
            ctx.ui.warn(
              `${checkout} was left in place: an implementing session is running in it`
            );
          } else {
            try {
              await ctx.ui.task('Removing the planner checkout', () =>
                run('git', ['worktree', 'remove', checkout], { cwd: ctx.root })
              );
            } catch (error) {
              checkoutLeft = true;
              ctx.ui.warn(
                `${checkout} was left in place: ${error instanceof Error ? error.message.trim() : String(error)}`
              );
            }
          }
        }
      } finally {
        rmdirSync(queue.lock);
      }
    }

    return {
      summary: checkoutLeft
        ? 'The launchd job is removed; the planner checkout was left in place'
        : 'The launchd job is removed',
      partial: checkoutLeft,
      json: { ...work, checkoutLeft }
    };
  }
});
