import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

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
  summary: 'Stop scheduled runs until resumed',
  description:
    'Writes the pause flag the queue script checks before it does anything. A run already in progress finishes.',
  danger: 'mutate',
  inputs: {
    host: hostInput(
      'Pause the queue in the agent container over ssh on this host instead of locally'
    )
  },

  async plan(ctx, { host }): Promise<Plan<Data>> {
    if (host) return remotePlan(ctx, { host, args: ['agent', 'pause'] });
    await requireScheduler(ctx.env, 'pause');
    const queue = paths(ctx.env);
    if (existsSync(queue.paused)) {
      return {
        steps: [],
        nothing: 'The queue is already paused',
        data: { queue }
      };
    }
    return {
      steps: [{ label: 'Pause the queue', detail: queue.paused }],
      data: { queue }
    };
  },

  async apply(ctx, data) {
    if ('remote' in data) return remoteApply(ctx, data.remote, 'Queue paused');
    const { queue } = data;
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.paused, '');
    return { summary: 'Queue paused' };
  }
});
