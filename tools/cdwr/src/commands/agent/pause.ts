import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { paths, requireHost } from '../../services/agent-queue';

export default defineCommand({
  summary: 'Stop scheduled runs until resumed',
  description:
    'Writes the pause flag the queue script checks before it does anything. A run already in progress finishes.',
  danger: 'mutate',
  inputs: {},

  async plan(ctx) {
    requireHost(['launchd', 'container'], ctx.env);
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

  async apply(_ctx, { queue }) {
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.paused, '');
    return { summary: 'Queue paused' };
  }
});
