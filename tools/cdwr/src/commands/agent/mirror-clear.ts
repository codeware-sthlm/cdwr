import { existsSync, rmSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { paths, requireHost } from '../../services/agent-queue';

export default defineCommand({
  summary: 'Stop mirroring attended session files',
  description: 'Removes the mirror target, so the session hook copies nowhere.',
  danger: 'mutate',
  inputs: {},

  async plan(ctx) {
    requireHost(['launchd'], ctx.env);
    const queue = paths(ctx.env);
    if (!existsSync(queue.mirror)) {
      return { steps: [], nothing: 'No mirror is set', data: { queue } };
    }
    return {
      steps: [{ label: 'Clear the mirror target', detail: queue.mirror }],
      data: { queue }
    };
  },

  async apply(_ctx, { queue }) {
    rmSync(queue.mirror, { force: true });
    return { summary: 'Mirror cleared' };
  }
});
