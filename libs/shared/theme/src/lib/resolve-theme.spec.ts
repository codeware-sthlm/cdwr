import { describe, expect, it } from 'vitest';

import { resolveTheme } from './resolve-theme';

describe('resolveTheme', () => {
  it('uses the cookie when the site still offers that theme', () => {
    expect(
      resolveTheme('codeware', ['spotlight', 'codeware'], 'spotlight')
    ).toBe('codeware');
  });

  it('falls back to the default for a deselected cookie theme', () => {
    expect(resolveTheme('frost', ['spotlight', 'codeware'], 'spotlight')).toBe(
      'spotlight'
    );
  });

  it('falls back to the default with no cookie', () => {
    expect(resolveTheme(null, ['spotlight', 'codeware'], 'codeware')).toBe(
      'codeware'
    );
  });

  // An unoffered theme renders a `data-theme` matching no CSS scope, which
  // leaves the page with no tokens at all
  it('never returns a default the site does not offer', () => {
    expect(resolveTheme(null, ['spotlight'], 'codeware')).toBe('spotlight');
    expect(resolveTheme('frost', ['spotlight'], 'frost')).toBe('spotlight');
  });

  it('returns the default when the site offers nothing', () => {
    expect(resolveTheme('frost', [], 'spotlight')).toBe('spotlight');
  });
});
