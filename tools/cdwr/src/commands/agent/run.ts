import { existsSync } from 'node:fs';

import { type Plan, defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';
import { preflight } from '../../cli/preflight';
import {
  checkRun,
  currentUid,
  jobState,
  lockAge,
  paths,
  readText,
  requireScheduler,
  worktreeOf
} from '../../services/agent-queue';
import { run } from '../../services/shell';

import {
  type QueuePaths,
  lockState,
  parseCheck,
  parseLoopPid,
  serviceTarget
} from './agent.logic';
import {
  type RemoteTarget,
  hostInput,
  remoteApply,
  remotePlan
} from './remote';

type Data = { uid: number } | { loopPid: number } | { remote: RemoteTarget };

export default defineCommand({
  summary: 'Start a planning run now',
  description:
    'Kicks the launchd job, or in the agent container wakes its loop, which runs the queue script as it would on schedule. Nothing starts when the queue is paused, busy or has nothing to plan.',
  danger: 'mutate',
  confirm: 'always',
  inputs: {
    host: hostInput(
      'Start a run in the agent container over ssh on this host instead of locally'
    )
  },

  async plan(ctx, { host: sshHost }): Promise<Plan<Data>> {
    if (sshHost)
      return remotePlan(ctx, { host: sshHost, args: ['agent', 'run'] });
    // Checked here, not as `needs`: with `--host` the run happens in the container
    preflight(['claude', 'jq'], ctx.env);
    const host = await requireScheduler(ctx.env, 'run');
    if (host === 'container') return containerPlan(paths(ctx.env));
    const job = await jobState();
    if (!job.loaded) {
      throw new CliError(
        'The agent queue job is not loaded',
        EXIT.failed,
        'Run `cdwr agent install`'
      );
    }
    const queue = paths(ctx.env);
    const none = (nothing: string) => ({
      steps: [],
      nothing,
      data: { uid: currentUid() }
    });
    if (existsSync(queue.paused)) {
      return none('The queue is paused; `cdwr agent resume` first');
    }
    const checked = await ctx.ui.task(
      'Asking the queue what it would take',
      () => checkRun(queue, worktreeOf(ctx), ctx.env),
      () => 'Asked the queue'
    );
    if (checked === undefined) {
      return none('The queue script is not installed; `cdwr agent install`');
    }
    const check = parseCheck(checked.decision);
    switch (check.kind) {
      case 'idle':
        return none('Nothing to plan');
      case 'busy':
        return none(
          lockState(lockAge(queue.lock), job.running) === 'stale'
            ? `A lock was left by a run that did not finish; \`rmdir ${queue.lock}\``
            : 'A run or a check is in progress; try again shortly'
        );
      case 'skip':
      case 'unknown':
        return none(check.text);
      case 'ready':
        return {
          steps: [
            {
              label: 'Start a planning run now',
              detail: `one of ${check.tickets.join(', ')}`
            }
          ],
          notes: [
            'Starts an Opus session on the Max allowance; nothing is billed'
          ],
          data: { uid: currentUid() }
        };
    }
  },

  async apply(ctx, data) {
    if ('remote' in data)
      return remoteApply(ctx, data.remote, 'Planning run started');
    if ('loopPid' in data) {
      process.kill(data.loopPid, 'SIGUSR1');
      return {
        summary: 'Container loop woken',
        next: ['`cdwr agent logs --run` shows its run once it has written']
      };
    }
    await run('launchctl', ['kickstart', serviceTarget(data.uid)]);
    return {
      summary: 'Planning run started',
      next: ['`cdwr agent logs --run` shows it once it has written']
    };
  }
});

/**
 * The container's run: a wake of its loop, the signal the listener sends. The run it
 * starts decides as a listener's would, so pause, the lock and the caps still apply.
 */
function containerPlan(queue: QueuePaths): Plan<Data> {
  const none = (nothing: string) => ({
    steps: [],
    nothing,
    data: { uid: currentUid() }
  });
  if (existsSync(queue.paused)) {
    return none('The queue is paused; `cdwr agent resume` first');
  }
  const loopPid = parseLoopPid(readText(queue.loopPid));
  if (loopPid === undefined || !alive(loopPid)) {
    return none(
      'No container loop to wake; the image may predate the wake, so `cdwr agent deploy --host <host>`'
    );
  }
  return {
    steps: [{ label: 'Wake the container loop', detail: `pid ${loopPid}` }],
    notes: [
      'The run plans only when the queue is free and has something to take; a run in progress takes the wake right after'
    ],
    data: { loopPid }
  };
}

/** Whether a process with this pid exists; EPERM means it does, under another user */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};
