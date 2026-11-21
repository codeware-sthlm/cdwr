import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';
import { run } from '../../services/shell';

import {
  mainCheckout,
  planStatusline,
  settingsPath,
  statuslineCommand
} from './statusline.logic';
import type { StatuslinePlan } from './statusline.logic';

/** The plan's outcome, or the error that says why the settings cannot take the status line */
const checked = (result: StatuslinePlan, file: string): StatuslinePlan => {
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
    default:
      return result;
  }
};

export default defineCommand({
  summary: "Show the plan's usage in the Claude status line",
  description:
    "Sets the status line in Claude Code's settings.json to the main checkout's statusline.sh, which prints the plan's 5h and 7d usage and sends it to the desk. Moves this installer's own status line from another checkout; never replaces one that isn't this one.",
  danger: 'mutate',
  inputs: {},

  async plan(ctx) {
    const file = settingsPath(ctx.env, homedir());
    // A linked worktree is removed when its ticket is done, so the line points at the main checkout
    const root = await run(
      'git',
      [
        '-C',
        ctx.root,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir'
      ],
      { timeout: 10_000 }
    ).then(
      ({ stdout }) => mainCheckout(stdout),
      () => ctx.root
    );
    const command = statuslineCommand(root);
    if (command === undefined) {
      throw new CliError(
        `The checkout path ${root} cannot be quoted into a command`,
        EXIT.failed,
        'Use a checkout whose absolute path has no single quote'
      );
    }
    const result = checked(planStatusline(readSettings(file), command), file);
    if (result.kind === 'install') {
      return {
        steps: [
          {
            label: 'Set the status line',
            detail: result.replaces
              ? `${file}, moved from ${result.replaces}`
              : file
          }
        ],
        data: { file, command }
      };
    }
    return {
      steps: [],
      nothing: 'The status line is already installed',
      data: { file, command }
    };
  },

  async apply(_ctx, { file, command }) {
    // Read again, so an edit made since the plan is kept
    const result = checked(planStatusline(readSettings(file), command), file);
    if (result.kind !== 'install') {
      return { summary: `Status line already set in ${file}`, json: { file } };
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    try {
      const mode = existingMode(file);
      writeFileSync(tmp, result.next, mode === undefined ? {} : { mode });
      if (mode !== undefined) chmodSync(tmp, mode);
      renameSync(tmp, file);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
    return { summary: `Status line set in ${file}`, json: { file } };
  }
});

/** The permission bits of the file, or undefined when it does not exist */
const existingMode = (file: string): number | undefined => {
  try {
    return statSync(file).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

/** The settings text, or undefined when the file does not exist */
const readSettings = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};
