import { describe, expect, it } from 'vitest';

import {
  ageText,
  bytes,
  dayKey,
  esc,
  inline,
  mtok,
  niceCeil,
  plural,
  runTime,
  seenAgo,
  span,
  tidy,
  txt,
  usd
} from './format';

describe('esc', () => {
  it('escapes the four characters and takes nothing', () => {
    expect(esc('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(7)).toBe('7');
  });
});

describe('tidy, txt and inline', () => {
  it.each([
    ['[the plan](https://example.com/x)', 'the plan'],
    [
      '[https://linear.app/codeware/issue/cod-12/x](https://linear.app/codeware/issue/cod-12/x)',
      'COD-12'
    ],
    ['<https://github.com/codeware-sthlm/cdwr/pull/699>', '#699'],
    ['see https://www.example.com/a/b/. Done', 'see example.com/a/b. Done'],
    ['https://linear.app/codeware/issue/COD-5/title,', 'COD-5,']
  ])('%s -> %s', (input, expected) => {
    expect(tidy(input)).toBe(expected);
  });

  it('escapes after tidying', () => {
    expect(txt('<b>[a](https://x.io)</b>')).toBe('&lt;b&gt;a&lt;/b&gt;');
  });

  it('wraps backticks in code', () => {
    expect(inline('run `cdwr` now')).toBe('run <code>cdwr</code> now');
  });
});

describe('plural', () => {
  it('picks one only for exactly one', () => {
    expect(plural(1, 'slot', 'slots')).toBe('1 slot');
    expect(plural(0, 'slot', 'slots')).toBe('0 slots');
    expect(plural(2, 'slot', 'slots')).toBe('2 slots');
  });
});

describe('ageText and span', () => {
  it.each([
    [0, '0 min ago'],
    [-3, '0 min ago'],
    [59.4, '59 min ago'],
    [60, '1 h ago'],
    [47 * 60, '47 h ago'],
    [48 * 60, '2 days ago']
  ])('ageText(%s) -> %s', (min, text) => {
    expect(ageText(min)).toBe(text);
  });

  it.each([
    [5, '5 min'],
    [65, '1 h 5 min']
  ])('span(%s) -> %s', (min, text) => {
    expect(span(min)).toBe(text);
  });
});

describe('time helpers', () => {
  const now = new Date('2026-10-29T12:00:00');

  it('measures how long ago an ISO time was', () => {
    expect(seenAgo('2026-10-29T11:30:00', now)).toBe('30 min ago');
    expect(seenAgo(null, now)).toBe('');
  });

  it('parses a stamp as local time', () => {
    expect(runTime('2026-10-29 12:00')).toBe(now.getTime());
  });

  it('keys a day in local time', () => {
    expect(dayKey(now)).toBe('2026-10-29');
    expect(dayKey(now.getTime())).toBe('2026-10-29');
    expect(dayKey('2026-01-05T00:30:00')).toBe('2026-01-05');
  });
});

describe('numbers', () => {
  it('formats dollars', () => {
    expect(usd(1234.5)).toBe('$1,235');
    expect(usd(1.5, 2)).toBe('$1.50');
    expect(usd(null)).toBe('?');
    expect(usd(undefined)).toBe('?');
  });

  it.each([
    [0, 1],
    [10, 10],
    [11, 20],
    [21, 25],
    [26, 50],
    [51, 100]
  ])('niceCeil(%s) -> %s', (v, expected) => {
    expect(niceCeil(v)).toBe(expected);
  });

  it.each([
    [999, '999'],
    [1500, '2k'],
    [2_400_000, '2.4M'],
    [3_456_000_000, '3.46B']
  ])('mtok(%s) -> %s', (n, text) => {
    expect(mtok(n)).toBe(text);
  });

  it.each([
    [0, '0 MiB'],
    [512 * 2 ** 20, '512 MiB'],
    [2 ** 30, '1.0 GiB'],
    [7.5 * 2 ** 30, '7.5 GiB']
  ])('bytes(%s) -> %s', (n, text) => {
    expect(bytes(n)).toBe(text);
  });
});
