import { describe, expect, it } from 'vitest';

import { formatTrend } from './site-stats-format';

describe('formatTrend', () => {
  it('signs a rise with a plus', () => {
    expect(formatTrend(12, 'en')).toBe('+12%');
  });

  it('signs a fall with a real minus', () => {
    expect(formatTrend(-5, 'en')).toBe('−5%');
  });

  it('leaves no sign on zero', () => {
    expect(formatTrend(0, 'en')).toBe('0%');
  });

  it('says nothing when there is no trend', () => {
    expect(formatTrend(null, 'en')).toBeNull();
  });

  it('follows the locale for the percent sign', () => {
    expect(formatTrend(12, 'sv')).toBe('+12 %');
  });
});
