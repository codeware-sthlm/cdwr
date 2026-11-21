import { mkdirSync, writeFileSync } from 'node:fs';

import { type Plan, defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { paths, readText, requireHost } from '../../services/agent-queue';

import {
  NOTIFY_LEVELS,
  type NotifyLevel,
  type QueuePaths,
  parseNotifyLevel
} from './agent.logic';
import {
  type RemoteTarget,
  hostInput,
  remoteApply,
  remotePlan
} from './remote';

type Data =
  | { queue: QueuePaths; level: NotifyLevel }
  | { remote: RemoteTarget; level?: NotifyLevel };

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
    ),
    host: hostInput(
      'Read or set the level of the queue in the agent container over ssh on this host instead of locally'
    )
  },

  async plan(ctx, { level, host }): Promise<Plan<Data>> {
    if (host) {
      // Without a level the remote answers its current one as nothing
      const remote = {
        host,
        args: ['agent', 'notify', ...(level ? [level] : [])]
      };
      const plan = await remotePlan(ctx, remote);
      return { ...plan, data: { remote, level } };
    }
    requireHost(['launchd', 'container'], ctx.env);
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

  async apply(ctx, data) {
    if ('remote' in data)
      return remoteApply(ctx, data.remote, `Notify level: ${data.level}`);
    const { queue, level } = data;
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.notifyLevel, `${level}\n`);
    return { summary: `Notify level: ${level}`, json: { level } };
  }
});
