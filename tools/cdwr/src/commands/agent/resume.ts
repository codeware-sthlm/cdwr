import { existsSync, rmSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { paths, requireMac } from '../../services/agent-queue';

export default defineCommand({
  summary: 'Let scheduled runs start again',
  description: 'Removes the pause flag, so the next scheduled run goes ahead.',
  danger: 'mutate',
  inputs: {},

  async plan(ctx) {
    requireMac();
    const queue = paths(ctx.env);
    if (!existsSync(queue.paused)) {
      return { steps: [], nothing: 'The queue is not paused', data: { queue } };
    }
    return {
      steps: [{ label: 'Resume the queue', detail: queue.paused }],
      data: { queue }
    };
  },

  async apply(_ctx, { queue }) {
    rmSync(queue.paused, { force: true });
    return { summary: 'Queue resumed' };
  }
});
