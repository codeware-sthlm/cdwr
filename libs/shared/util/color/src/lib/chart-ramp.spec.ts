import { describe, expect, it } from 'vitest';

import { DEFAULT_RECIPE, buildThemeTokens } from './build-theme-tokens';
import { chartFamilies } from './chart-ramp';
import { parseColor } from './oklch';
import { NEUTRAL_FAMILIES, shade } from './palette';

const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5'
];

describe('chartFamilies', () => {
  it('starts on the brand itself', () => {
    expect(chartFamilies('teal')[0]).toBe('teal');
    expect(chartFamilies('rose')[0]).toBe('rose');
  });

  // The series is chosen from Tailwind's families, which a brand of ours is
  // not in — searching by hue would open the series on a lookalike
  it('starts on a brand the series cannot reach', () => {
    expect(chartFamilies('yale-blue')[0]).toBe('yale-blue');
    expect(chartFamilies('space-cadet')[0]).toBe('space-cadet');
  });

  it('returns five distinct families', () => {
    for (const brand of ['teal', 'blue', 'amber', 'violet'] as const) {
      const families = chartFamilies(brand);
      expect(families).toHaveLength(5);
      expect(new Set(families).size).toBe(5);
    }
  });

  it('spreads them around the wheel', () => {
    const hues = chartFamilies('blue').map(
      (family) => parseColor(shade(family, '600'))?.h ?? 0
    );

    // Consecutive picks should be far apart, not neighbouring shades of one hue
    for (let i = 1; i < hues.length; i++) {
      const delta = Math.abs(hues[i] - hues[0]) % 360;
      expect(Math.min(delta, 360 - delta)).toBeGreaterThan(20);
    }
  });

  // Five greys are not a chart series
  it.each(NEUTRAL_FAMILIES)('falls back for the neutral brand %s', (brand) => {
    const families = chartFamilies(brand);

    expect(families).toEqual(['orange', 'teal', 'cyan', 'amber', 'blue']);
    for (const family of families) {
      expect(NEUTRAL_FAMILIES).not.toContain(family);
    }
  });

  it('never picks a neutral for a chromatic brand', () => {
    for (const family of chartFamilies('emerald')) {
      expect(NEUTRAL_FAMILIES).not.toContain(family);
    }
  });
});

describe('chart tokens', () => {
  it('follow the brand', () => {
    const teal = buildThemeTokens({ ...DEFAULT_RECIPE, brandFamily: 'teal' });
    const rose = buildThemeTokens({ ...DEFAULT_RECIPE, brandFamily: 'rose' });

    for (const token of CHART_TOKENS) {
      expect(teal.light[token]).not.toBe(rose.light[token]);
      expect(teal.dark[token]).not.toBe(rose.dark[token]);
    }
  });

  it('resolve to literals in both schemes', () => {
    const built = buildThemeTokens({
      ...DEFAULT_RECIPE,
      brandFamily: 'violet'
    });

    for (const token of CHART_TOKENS) {
      expect(parseColor(built.light[token])).not.toBeNull();
      expect(parseColor(built.dark[token])).not.toBeNull();
    }
  });

  it('lighten in dark so a series reads on a dark surface', () => {
    const built = buildThemeTokens({ ...DEFAULT_RECIPE, brandFamily: 'blue' });

    for (const token of CHART_TOKENS) {
      const light = parseColor(built.light[token]);
      const dark = parseColor(built.dark[token]);
      expect(dark?.l).toBeGreaterThan(light?.l ?? 1);
    }
  });
});
