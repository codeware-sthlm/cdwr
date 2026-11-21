import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';

import { plain } from '../theme';

import { colors } from './palette';
import type { LogEntry } from './store';

/** One terminal row of the run pane, wrapped so Ink never has to */
export type Row =
  | {
      kind: 'text';
      text: string;
      color?: string;
      dim?: boolean;
      bold?: boolean;
    }
  | { kind: 'spinner'; text: string };

/** Border and horizontal padding of a note card */
const CARD_INSET = 4;

/** The lines of a text wrapped at a width; ANSI codes take no room */
export const wrapLines = (text: string, width: number): string[] =>
  width > 0
    ? wrapAnsi(text, width, { hard: true, trim: false }).split('\n')
    : text.split('\n');

const cellsWidth = (cells: string[]) =>
  Math.max(...cells.map((c) => plain(c).length), 0);

type TextOptions = Omit<Extract<Row, { kind: 'text' }>, 'kind' | 'text'>;

const textRows = (
  text: string,
  width: number,
  options: TextOptions = {}
): Row[] =>
  wrapLines(text, width).map((line) => ({
    kind: 'text',
    text: line,
    ...options
  }));

const tableRows = (head: string[], rows: string[][], width: number): Row[] => {
  const widths = head.map((h, i) =>
    cellsWidth([h, ...rows.map((r) => r[i] ?? '')])
  );
  const pad = (cell: string, i: number) =>
    cell + ' '.repeat(Math.max(0, (widths[i] ?? 0) - plain(cell).length));
  return [
    ...textRows(head.map(pad).join('  '), width, { bold: true }),
    ...rows.flatMap((row) => textRows(row.map(pad).join('  '), width))
  ];
};

const border = chalk.hex(colors.border);

/**
 * A note as rows: a round border drawn by hand, so a card taller than the
 * pane scrolls line by line like everything else.
 */
const noteRows = (
  title: string | undefined,
  lines: ReadonlyArray<string>,
  width: number
): Row[] => {
  const inner = Math.max(1, width - CARD_INSET);
  const frame = (content: string): Row => ({
    kind: 'text',
    text: `${border('│')} ${content}${' '.repeat(Math.max(0, inner - plain(content).length))} ${border('│')}`
  });
  const bar = '─'.repeat(Math.max(0, width - 2));
  return [
    { kind: 'text', text: border(`╭${bar}╮`) },
    ...(title ? [frame(border.bold(title))] : []),
    ...lines.flatMap((line) => wrapLines(line, inner)).map(frame),
    { kind: 'text', text: border(`╰${bar}╯`) }
  ];
};

const entryRows = (entry: LogEntry, width: number): Row[] => {
  switch (entry.kind) {
    case 'task': {
      if (entry.state === 'running')
        return [{ kind: 'spinner', text: entry.label }];
      const glyph =
        entry.state === 'done'
          ? chalk.hex(colors.ok)('✔')
          : chalk.hex(colors.danger)('✖');
      return textRows(`${glyph} ${entry.text ?? entry.label}`, width);
    }
    case 'line':
      return textRows(entry.text, width, {
        color:
          entry.level === 'success'
            ? colors.ok
            : entry.level === 'warn'
              ? colors.warn
              : entry.level === 'error'
                ? colors.danger
                : undefined
      });
    case 'raw':
      return textRows(entry.text, width);
    case 'table':
      return tableRows(entry.head, entry.rows, width);
    case 'note':
      return noteRows(entry.title, entry.lines, width);
  }
};

/** Entries never change once logged, so their rows are wrapped once per width */
const wrapped = new WeakMap<LogEntry, { width: number; rows: Row[] }>();

/** The log as screen rows at a pane width */
export const flattenLog = (
  log: ReadonlyArray<LogEntry>,
  width: number
): Row[] =>
  log.flatMap((entry) => {
    const cached = wrapped.get(entry);
    if (cached && cached.width === width) return cached.rows;
    const rows = entryRows(entry, width);
    wrapped.set(entry, { width, rows });
    return rows;
  });

/** The slice of rows on screen and how far it can scroll */
export interface Viewport {
  rows: Row[];
  /** Index of the first visible row */
  start: number;
  /** Largest `start`: the bottom, where the tail is followed */
  max: number;
  /** Rows hidden after the last visible one */
  below: number;
}

/**
 * The `budget` rows from `scroll`, or the last ones when `scroll` is null.
 * A number is clamped to what the log allows. While scrolled up, one row is
 * left for the "more below" line.
 */
export const viewport = (
  rows: ReadonlyArray<Row>,
  budget: number,
  scroll: number | null
): Viewport => {
  const max = Math.max(0, rows.length - budget);
  const start = scroll === null ? max : Math.min(Math.max(0, scroll), max);
  const room = start < max ? budget - 1 : budget;
  const visible = rows.slice(start, start + Math.max(1, room));
  return {
    rows: visible,
    start,
    max,
    below: rows.length - start - visible.length
  };
};
