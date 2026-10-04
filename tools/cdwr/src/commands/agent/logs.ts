import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths, readText, requireMac } from '../../services/agent-queue';

import { latestRunLog, tailLines } from './agent.logic';

export default defineCommand({
  summary: "The scheduler log, or the latest run's full log",
  description:
    'Shows the end of the scheduler log: one line per decision. With --run, the end of the latest planning run instead. --lines 0 shows the whole file.',
  danger: 'read',
  inputs: {
    run: input.boolean({
      prompt: 'Show the latest run?',
      description:
        "Show the latest run's full log instead of the scheduler log",
      default: false
    }),
    lines: input.number({
      prompt: 'How many lines?',
      description: 'Lines from the end; 0 for the whole file',
      default: 40
    })
  },

  async plan(ctx, { run, lines }) {
    requireMac();
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
    return readOnly({ file, lines });
  },

  async apply(ctx, { file, lines }) {
    const text = readText(file) ?? '';
    const shown = tailLines(text, lines > 0 ? lines : Infinity);
    ctx.ui.write(shown.join('\n'));
    return { summary: file, json: { file, lines: shown } };
  }
});
