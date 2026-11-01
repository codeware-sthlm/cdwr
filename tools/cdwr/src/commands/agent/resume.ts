import { existsSync, rmSync } from 'node:fs';

import { type Plan, defineCommand } from '../../cli/command';
import { paths, requireScheduler } from '../../services/agent-queue';

import type { QueuePaths } from './agent.logic';
import {
  type RemoteTarget,
  hostInput,
  remoteApply,
  remotePlan
} from './remote';

type Data = { queue: QueuePaths } | { remote: RemoteTarget };

export default defineCommand({
  summary: 'Let scheduled runs start again',
  description: 'Removes the pause flag, so the next scheduled run goes ahead.',
  danger: 'mutate',
  inputs: {
    host: hostInput(
      'Resume the queue in the agent container over ssh on this host instead of locally'
    )
  },

  async plan(ctx, { host }): Promise<Plan<Data>> {
    if (host) return remotePlan(ctx, { host, args: ['agent', 'resume'] });
    await requireScheduler(ctx.env, 'resume');
    const queue = paths(ctx.env);
    if (!existsSync(queue.paused)) {
      return { steps: [], nothing: 'The queue is not paused', data: { queue } };
    }
    return {
      steps: [{ label: 'Resume the queue', detail: queue.paused }],
      data: { queue }
    };
  },

  async apply(ctx, data) {
    if ('remote' in data) return remoteApply(ctx, data.remote, 'Queue resumed');
    rmSync(data.queue.paused, { force: true });
    return { summary: 'Queue resumed' };
  }
});
