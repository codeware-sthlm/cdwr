import { mkdirSync, writeFileSync } from 'node:fs';

import { defineCommand } from '../../cli/command';
import { CliError, UsageError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths, readText, requireHost } from '../../services/agent-queue';
import { CommandError, run } from '../../services/shell';

import {
  DEFAULT_CONTAINER,
  DEFAULT_DIR,
  checkArgs,
  checkFailure,
  invalidPart,
  mirrorTarget
} from './mirror.logic';

export default defineCommand({
  summary: 'Mirror attended session files into the agent container',
  description:
    'Writes the mirror target <host>:docker:<container>:<dir> that the session hook copies each attended session file to. Checks first, over ssh, that the container is running and the directory is writable.',
  danger: 'mutate',
  inputs: {
    host: input.string({
      short: 'H',
      prompt: 'Which ssh host runs the agent container?',
      description: 'The ssh host name, as in ~/.ssh/config'
    }),
    container: input.string({
      short: 'c',
      prompt: 'Which container?',
      description: 'The agent container name',
      default: DEFAULT_CONTAINER
    }),
    dir: input.string({
      short: 'D',
      prompt: 'Which directory in the container?',
      description: 'Where session files land inside the container',
      default: DEFAULT_DIR
    })
  },

  async plan(ctx, { host, container, dir }) {
    requireHost(['launchd'], ctx.env);
    const bad = invalidPart({ host, container, dir });
    if (bad !== undefined) {
      throw new UsageError(
        `--${bad} holds a character that is not allowed`,
        'Use only letters, digits and . _ @ / : -'
      );
    }
    const target = mirrorTarget(host, container, dir);
    const queue = paths(ctx.env);
    if (readText(queue.mirror)?.trim() === target) {
      return {
        steps: [],
        nothing: `The mirror already points at ${target}`,
        data: { queue, target }
      };
    }
    try {
      await run('ssh', checkArgs(host, container, dir), { timeout: 20_000 });
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      throw new CliError(
        checkFailure(error.code, error.stderr, host, container, dir)
      );
    }
    return {
      steps: [{ label: 'Set the mirror target', detail: target }],
      data: { queue, target }
    };
  },

  async apply(_ctx, { queue, target }) {
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.mirror, `${target}\n`);
    return { summary: `Mirroring to ${target}`, json: { target } };
  }
});
