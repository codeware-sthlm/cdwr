import { workspaceLocale } from './apply-site-definition';

describe('workspaceLocale', () => {
  it('takes the locale the settings name', () => {
    expect(workspaceLocale('sv', ['en', 'sv'])).toBe('sv');
  });

  it('takes the first supported locale when there are no settings yet', () => {
    // A Swedish-only workspace used to get English content and an English
    // default locale, because the fallback ignored what it supports
    expect(workspaceLocale(undefined, ['sv'])).toBe('sv');
  });

  it('falls back to English only when nothing else is known', () => {
    expect(workspaceLocale(null, [])).toBe('en');
    expect(workspaceLocale(undefined, undefined)).toBe('en');
  });
});
