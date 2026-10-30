import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';

import {
  planStatusline,
  settingsPath,
  statuslineCommand
} from './statusline.logic';

export default defineCommand({
  summary: "Show the plan's usage in the Claude status line",
  description:
    "Sets the status line in Claude Code's settings.json to statusline.sh, which prints the plan's 5h and 7d usage and sends it to the desk. Never replaces a status line that is already set.",
  danger: 'mutate',
  inputs: {},

  async plan(ctx) {
    const file = settingsPath(ctx.env, homedir());
    const command = statuslineCommand(ctx.root);
    if (command === undefined) {
      throw new CliError(
        `The checkout path ${ctx.root} cannot be quoted into a command`,
        EXIT.failed,
        'Use a checkout whose absolute path has no single quote'
      );
    }
    const result = planStatusline(readSettings(file), command);
    switch (result.kind) {
      case 'invalid':
        throw new CliError(
          `${file} is not a JSON object`,
          EXIT.failed,
          'Fix the file by hand, then run this again'
        );
      case 'taken':
        throw new CliError(
          `A status line is already set in ${file}`,
          EXIT.failed,
          'Remove its statusLine entry first, then run this again'
        );
      case 'current':
        return {
          steps: [],
          nothing: 'The status line is already installed',
          data: { file, next: '' }
        };
      case 'install':
        return {
          steps: [{ label: 'Set the status line', detail: file }],
          data: { file, next: result.next }
        };
    }
  },

  async apply(_ctx, { file, next }) {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    try {
      writeFileSync(tmp, next);
      renameSync(tmp, file);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
    return { summary: `Status line set in ${file}`, json: { file } };
  }
});

/** The settings text, or undefined when the file does not exist */
const readSettings = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};
