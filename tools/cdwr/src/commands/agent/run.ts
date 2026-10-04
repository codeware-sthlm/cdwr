import { existsSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';
import {
  checkRun,
  currentUid,
  jobState,
  paths,
  requireMac,
  worktreeOf
} from '../../services/agent-queue';
import { run } from '../../services/shell';

import { parseCheck, serviceTarget } from './agent.logic';

export default defineCommand({
  summary: 'Start a planning run now',
  description:
    'Kicks the launchd job, which runs the queue script as it would on schedule. Nothing starts when the queue is paused, busy or has nothing to plan.',
  danger: 'mutate',
  confirm: 'always',
  needs: ['claude', 'jq'],
  inputs: {},

  async plan(ctx) {
    requireMac();
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
    const line = await ctx.ui.task(
      'Asking the queue what it would take',
      () => checkRun(queue, worktreeOf(ctx), ctx.env),
      () => 'Asked the queue'
    );
    if (line === undefined) {
      return none('The queue script is not installed; `cdwr agent install`');
    }
    const check = parseCheck(line);
    switch (check.kind) {
      case 'idle':
        return none('Nothing to plan');
      case 'busy':
        return none(
          job.running
            ? 'A run is already in progress'
            : `A lock was left by a run that did not finish; \`rmdir ${queue.lock}\``
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

  async apply(_ctx, { uid }) {
    await run('launchctl', ['kickstart', serviceTarget(uid)]);
    return {
      summary: 'Planning run started',
      next: ['`cdwr agent logs --run` shows it once it has written']
    };
  }
});
