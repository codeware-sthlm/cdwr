import Table from 'cli-table3';

import { plain, theme } from './theme';

/** A cli-table3 table with the shared chrome; `colWidths` are content widths, padding is added */
export function createTable(
  head: readonly string[],
  rows: readonly (readonly string[])[],
  options: { colWidths?: readonly number[]; wordWrap?: boolean } = {}
): Table.Table {
  const { colWidths, wordWrap } = options;
  const table = new Table({
    head: head.map((h) => theme.title(h)),
    style: { head: [], border: [] },
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    ...(colWidths ? { colWidths: colWidths.map((w) => w + 2) } : {}), // cell padding
    ...(wordWrap ? { wordWrap: true } : {})
  });
  for (const row of rows) {
    table.push(
      row.map((cell) =>
        // Paths and commands must stay complete: break long tokens, never truncate.
        // Character wrapping is blind to ANSI codes, so styled cells keep word wrapping.
        wordWrap && plain(cell) === cell
          ? { content: cell, wrapOnWordBoundary: false }
          : cell
      )
    );
  }
  return table;
}
