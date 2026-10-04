import { mkdirSync, writeFileSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { paths, readText, requireMac } from '../../services/agent-queue';

import { NOTIFY_LEVELS, parseNotifyLevel } from './agent.logic';

export default defineCommand({
  summary: 'Which notices the queue sends: all, or only what needs you',
  description:
    "`all` sends progress and action notices, `action` only what needs you (gates, a PR ready, failed runs). The scheduler's own run notices are always action. Without an argument, prints the current level.",
  danger: 'mutate',
  confirm: 'never',
  inputs: {
    level: input.optional(
      input.enum(NOTIFY_LEVELS, {
        prompt: 'Which level?',
        description: 'all, or action for only what needs you',
        positional: true,
        flagOnly: true
      }),
      () => true
    )
  },

  async plan(ctx, { level }) {
    requireMac();
    const queue = paths(ctx.env);
    const current = parseNotifyLevel(readText(queue.notifyLevel));
    if (level === undefined) {
      return {
        steps: [],
        nothing: `Notify level: ${current}`,
        data: { queue, level: current }
      };
    }
    if (level === current) {
      return {
        steps: [],
        nothing: `Already ${current}`,
        data: { queue, level }
      };
    }
    return {
      steps: [
        { label: `Set the notify level to ${level}`, detail: queue.notifyLevel }
      ],
      data: { queue, level }
    };
  },

  async apply(_ctx, { queue, level }) {
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.notifyLevel, `${level}\n`);
    return { summary: `Notify level: ${level}`, json: { level } };
  }
});
