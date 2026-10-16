import { plain } from '../theme';

import { flattenLog, rowCount, viewport } from './rows';
import type { LogEntry } from './store';

const line = (text: string): LogEntry => ({
  kind: 'line',
  level: 'info',
  text
});

describe('flattenLog', () => {
  it('wraps a long line into several rows', () => {
    const rows = flattenLog([line('x'.repeat(300))], 100);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === 'text')).toBe(true);
  });

  it('counts colour codes as zero width', () => {
    const text = 'y'.repeat(250);
    const coloured = `\u001b[32m✔\u001b[39m ${text}`;
    expect(flattenLog([line(coloured)], 100)).toHaveLength(
      flattenLog([line(plain(coloured))], 100).length
    );
    expect(
      flattenLog(
        [{ kind: 'task', id: 1, label: 'l', state: 'done', text }],
        100
      )
    ).toHaveLength(3);
  });

  it('keeps a running task as one spinner row', () => {
    expect(
      flattenLog([{ kind: 'task', id: 1, label: 'go', state: 'running' }], 80)
    ).toEqual([{ kind: 'spinner', text: 'go' }]);
  });

  it('splits raw output on newlines', () => {
    expect(flattenLog([{ kind: 'raw', text: 'a\nb\nc' }], 80)).toHaveLength(3);
  });

  it('wraps a table row wider than the pane', () => {
    const entry: LogEntry = {
      kind: 'table',
      head: ['name', 'value'],
      rows: [['a', 'z'.repeat(90)]]
    };
    expect(flattenLog([entry], 200)).toHaveLength(2);
    expect(flattenLog([entry], 50).length).toBeGreaterThan(2);
  });

  it('wraps note lines inside the card', () => {
    const [note] = flattenLog(
      [{ kind: 'note', lines: ['n'.repeat(190)] }],
      100
    );
    expect(note).toMatchObject({ kind: 'note' });
    if (note?.kind !== 'note') return;
    expect(note.lines).toHaveLength(2);
    expect(rowCount(note)).toBe(4);
  });

  it('leaves text unwrapped without a width', () => {
    expect(flattenLog([line('x'.repeat(300))], 0)).toHaveLength(1);
  });
});

describe('rowCount', () => {
  it('is one for text and lines plus frame for a note', () => {
    expect(rowCount({ kind: 'text', text: 'a' })).toBe(1);
    expect(rowCount({ kind: 'spinner', text: 'a' })).toBe(1);
    expect(rowCount({ kind: 'note', lines: ['a', 'b'] })).toBe(4);
    expect(rowCount({ kind: 'note', title: 'T', lines: ['a', 'b'] })).toBe(5);
  });
});

describe('viewport', () => {
  const rows = flattenLog(
    Array.from({ length: 10 }, (_, i) => line(`row ${i}`)),
    80
  );

  it('follows the tail when not scrolled', () => {
    const v = viewport(rows, 4, null);
    expect(v.start).toBe(6);
    expect(v.max).toBe(6);
    expect(v.below).toBe(0);
  });

  it('shows rows from a scroll position and counts what is below', () => {
    const v = viewport(rows, 4, 2);
    // One row is kept for the "more below" line
    expect(v.rows).toHaveLength(3);
    expect(v.below).toBe(5);
  });

  it('clamps a scroll past the end', () => {
    expect(viewport(rows, 4, 99).start).toBe(6);
    expect(viewport(rows, 4, -3).start).toBe(0);
  });

  it('counts a note by its height', () => {
    const withNote = [
      ...rows,
      ...flattenLog([{ kind: 'note', lines: ['a', 'b'] }], 80)
    ];
    const v = viewport(withNote, 5, null);
    expect(v.rows).toHaveLength(2);
    expect(v.rows.at(-1)?.kind).toBe('note');
  });

  it('still shows a note taller than the budget', () => {
    const tall = flattenLog(
      [line('before'), { kind: 'note', lines: ['a', 'b', 'c', 'd', 'e', 'f'] }],
      80
    );
    const v = viewport(tall, 5, null);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]?.kind).toBe('note');
    expect(viewport(tall, 5, 0).rows[0]?.kind).toBe('text');
  });

  it('counts hidden rows in terminal rows', () => {
    const withNote = [
      ...rows,
      ...flattenLog([{ kind: 'note', lines: ['a', 'b'] }], 80)
    ];
    expect(viewport(withNote, 4, 0).below).toBe(7 + 4);
  });
});
