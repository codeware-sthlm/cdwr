import { outputWidth, tableLayout } from './table-layout';

const chrome = (columns: number) => 3 * columns + 1;
const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0);

describe('tableLayout', () => {
  it('returns natural widths when the table fits', () => {
    expect(
      tableLayout(
        ['key', 'value'],
        [
          ['status', 'ok'],
          ['x', 'fine']
        ],
        80
      )
    ).toEqual([6, 5]);
  });

  it('shrinks the last column to the remainder', () => {
    const widths = tableLayout(
      ['key', 'value'],
      [['status', 'x'.repeat(200)]],
      80
    );
    expect(widths).toEqual([6, 80 - chrome(2) - 6]);
    expect(sum(widths) + chrome(2)).toBe(80);
  });

  it('shrinks the widest fixed column first', () => {
    const widths = tableLayout(
      ['a', 'b', 'c'],
      [['x'.repeat(30), 'y'.repeat(10), 'z'.repeat(50)]],
      60
    );
    expect(widths[1]).toBe(10);
    expect(widths[0]).toBeLessThan(30);
    expect(widths[2]).toBe(20);
    expect(sum(widths) + chrome(3)).toBe(60);
  });

  it('applies floors on a tiny width', () => {
    expect(
      tableLayout(
        ['a', 'b', 'c'],
        [['x'.repeat(30), 'y'.repeat(30), 'z'.repeat(30)]],
        10
      )
    ).toEqual([8, 8, 20]);
  });

  it('keeps every column at its natural width while the row fits', () => {
    const head = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const row = [
      'aaaaaaaaaaaa',
      'bbbbbbbbbbbb',
      'cccccccccccc',
      'dddddddddddd',
      'eeeeeeeeeeee',
      'ffffffffffff',
      'ok'
    ];
    const widths = tableLayout(head, [row], 120);
    expect(widths).toEqual(row.map((cell) => cell.length));
  });

  it('does not count ANSI codes', () => {
    expect(tableLayout(['key'], [['\u001b[31mred\u001b[39m']], 80)).toEqual([
      3
    ]);
  });
});

describe('outputWidth', () => {
  it('prefers the terminal columns', () => {
    expect(outputWidth(100, { columns: 120 }, { COLUMNS: '90' })).toBe(120);
  });

  it('falls back to COLUMNS', () => {
    expect(outputWidth(100, {}, { COLUMNS: '90' })).toBe(90);
    expect(outputWidth(100, { columns: 0 }, { COLUMNS: '90' })).toBe(90);
  });

  it('falls back to the default', () => {
    expect(outputWidth(100, {}, {})).toBe(100);
  });

  it('ignores a non-numeric or zero COLUMNS', () => {
    expect(outputWidth(100, {}, { COLUMNS: 'abc' })).toBe(100);
    expect(outputWidth(100, {}, { COLUMNS: '0' })).toBe(100);
    expect(outputWidth(100, {}, { COLUMNS: '-5' })).toBe(100);
  });
});
