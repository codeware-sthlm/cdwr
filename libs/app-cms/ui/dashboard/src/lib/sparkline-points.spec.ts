import { describe, expect, it } from 'vitest';

import { sparklinePoints } from './sparkline-points';

describe('sparklinePoints', () => {
  it('is empty without values', () => {
    expect(sparklinePoints([])).toBe('');
  });

  it('draws a single value as a flat line across the box', () => {
    expect(sparklinePoints([4], 100, 30)).toBe('0,0 100,0');
  });

  it('keeps an all-zero series along the bottom', () => {
    expect(sparklinePoints([0, 0, 0], 100, 30)).toBe('0,30 50,30 100,30');
  });

  it('scales from zero to the maximum, oldest first', () => {
    expect(sparklinePoints([0, 5, 10], 100, 30)).toBe('0,30 50,15 100,0');
  });

  it('never produces NaN', () => {
    expect(sparklinePoints([0], 100, 30)).not.toContain('NaN');
    expect(sparklinePoints([3, 3, 3], 100, 30)).not.toContain('NaN');
  });
});
