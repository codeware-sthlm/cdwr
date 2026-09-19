import Table from 'cli-table3';

import { messageOf } from '../cli/errors';

import { createSilentUi } from './silent';
import { symbols, theme } from './theme';
import type { Ui } from './ui';

/**
 * Plain lines on stdout for a run without a terminal and without --json:
 * a pipe, a CI log. Never prompts.
 */
export function createPlainUi(
  stdout: (line: string) => void = (line) => process.stdout.write(`${line}\n`)
): Ui {
  const silent = createSilentUi((line) => process.stderr.write(`${line}\n`));
  return {
    ...silent,
    intro: (title) => stdout(theme.title(title)),
    outro: (message) => stdout(message),
    info: (message) => stdout(message),
    success: (message) => stdout(`${symbols.ok} ${message}`),
    warn: (message) => stdout(`${symbols.warn} ${message}`),
    error: (message) => stdout(`${symbols.fail} ${message}`),
    note: (body, title) => {
      if (title) stdout(theme.title(title));
      for (const line of Array.isArray(body) ? body : body.split('\n')) {
        stdout(`  ${line}`);
      }
    },
    write: (text) => stdout(text),
    table: (head, rows) => {
      const table = new Table({
        head: head.map((h) => theme.title(h)),
        style: { head: [], border: [] },
        chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
      });
      for (const row of rows) table.push(row);
      stdout(table.toString());
    },
    async task(label, work, done) {
      try {
        const result = await work();
        stdout(`${symbols.ok} ${done ? done(result) : label}`);
        return result;
      } catch (error) {
        stdout(`${symbols.fail} ${label}: ${messageOf(error)}`);
        throw error;
      }
    }
  };
}
