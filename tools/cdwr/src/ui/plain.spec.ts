import { createPlainUi } from './plain';
import { plain } from './theme';

describe('createPlainUi table', () => {
  it('fits the width without losing the cell text', () => {
    const lines: string[] = [];
    const cell = 'abcdefghij'.repeat(30);
    const ui = createPlainUi(
      (line) => lines.push(line),
      () => undefined,
      () => 100
    );

    ui.table(['key', 'value'], [['status', cell]]);

    const output = lines.flatMap((chunk) => plain(chunk).split('\n'));
    expect(Math.max(...output.map((line) => line.length))).toBeLessThanOrEqual(
      100
    );
    const joined = output
      .map((line) => line.split('│')[2]?.trim() ?? '')
      .join('');
    expect(joined).toBe(`value${cell}`);
  });
});
