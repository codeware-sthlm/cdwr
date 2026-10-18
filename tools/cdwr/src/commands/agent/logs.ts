import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths, readText, requireHost } from '../../services/agent-queue';
import { CommandError, run as exec } from '../../services/shell';

import {
  latestRunLog,
  remoteListLogs,
  remoteLogFile,
  remoteReadLog,
  tailLines
} from './agent.logic';

export default defineCommand({
  summary: "The scheduler log, or the latest run's full log",
  description:
    'Shows the end of the scheduler log: one line per decision. With --run, the end of the latest planning run instead. --lines 0 shows the whole file. With --host, reads the agent container logs over ssh on that host.',
  danger: 'read',
  inputs: {
    run: input.boolean({
      prompt: 'Show the latest run?',
      short: 'r',
      description:
        "Show the latest run's full log instead of the scheduler log",
      default: false
    }),
    lines: input.number({
      prompt: 'How many lines?',
      short: 'l',
      description: 'Lines from the end; 0 for the whole file',
      default: 40
    }),
    host: input.string({
      prompt: 'Which host runs the agent container?',
      short: 'H',
      description:
        'Read the logs of the agent container over ssh on this host instead of locally',
      default: ''
    })
  },

  async plan(ctx, { run, lines, host }) {
    if (host) {
      let names: string[] = [];
      if (run) {
        names = (await ssh(remoteListLogs(host))).split('\n');
      }
      const file = remoteLogFile(run, names);
      if (!file) {
        throw new CliError(
          `No planning run has been logged yet on ${host}`,
          undefined,
          'The container writes one when the scheduler runs'
        );
      }
      return readOnly({ file, lines, host });
    }
    requireHost(['launchd', 'container'], ctx.env);
    const queue = paths(ctx.env);
    let file = queue.schedulerLog;
    if (run) {
      const latest = latestRunLog(
        existsSync(queue.logs) ? readdirSync(queue.logs) : []
      );
      if (!latest) {
        throw new CliError(
          'No planning run has been logged yet',
          undefined,
          'Run `cdwr agent run`'
        );
      }
      file = join(queue.logs, latest);
    }
    if (!existsSync(file)) {
      throw new CliError(
        `Nothing logged yet at ${file}`,
        undefined,
        'The scheduler writes it once installed: `cdwr agent install`'
      );
    }
    return readOnly({ file, lines, host: '' });
  },

  async apply(ctx, { file, lines, host }) {
    const text = host
      ? await ssh(remoteReadLog(host, file, lines))
      : (readText(file) ?? '');
    const shown = tailLines(text, lines > 0 ? lines : Infinity);
    ctx.ui.write(shown.join('\n'));
    return { summary: file, json: { file, lines: shown } };
  }
});

/** ssh with these arguments, never through a shell string; a failure says what ssh said */
async function ssh(args: string[]): Promise<string> {
  try {
    return (await exec('ssh', args, { timeout: 30_000 })).stdout;
  } catch (error) {
    if (error instanceof CommandError) {
      throw new CliError(
        `Could not read the logs over ssh on ${args[0]}: ${error.stderr.trim() || error.message}`,
        undefined,
        'Check that the host is reachable and the container cdwr-agent runs'
      );
    }
    throw error;
  }
}
