import { describe, expect, it } from 'vitest';

import {
  customThemeCss,
  isValidThemeSlug,
  isValidTokenName,
  isValidTokenValue
} from './custom-theme-css';

/** What every block ends with while its stored map predates the track. */
const TRACK = ';--core-action-btn-track:var(--muted)';

const theme = (
  overrides: Partial<Parameters<typeof customThemeCss>[0][0]>
) => ({
  slug: 'ocean',
  tokensLight: { '--background': 'oklch(1 0 0)' },
  tokensDark: {},
  ...overrides
});

describe('customThemeCss', () => {
  it('scopes light tokens to the theme attribute', () => {
    expect(customThemeCss([theme({})])).toBe(
      `[data-theme='ocean']{--background:oklch(1 0 0)${TRACK}}`
    );
  });

  // `[data-theme='x'][data-theme='dark']` can never match once the attribute
  // carries the theme name — the same trap theme-sync guards for built-ins
  it('scopes dark tokens with the class, not the attribute', () => {
    expect(
      customThemeCss([theme({ tokensDark: { '--background': '#000' } })])
    ).toBe(
      `[data-theme='ocean']{--background:oklch(1 0 0)${TRACK}}\n` +
        "[data-theme='ocean'].dark{--background:#000}"
    );
  });

  it('emits nothing for a theme with no light tokens', () => {
    expect(
      customThemeCss([
        theme({ tokensLight: {}, tokensDark: { '--background': '#000' } })
      ])
    ).toBe('');
  });

  it('fills in a token an older theme was saved without', () => {
    expect(customThemeCss([theme({})])).toContain(
      '--core-action-btn-track:var(--muted)'
    );
  });

  it('keeps a stored value over the fill-in', () => {
    expect(
      customThemeCss([
        theme({
          tokensLight: {
            '--background': '#fff',
            '--core-action-btn-track': '#eee'
          }
        })
      ])
    ).toBe(
      "[data-theme='ocean']{--background:#fff;--core-action-btn-track:#eee}"
    );
  });

  it('joins several themes', () => {
    const css = customThemeCss([theme({}), theme({ slug: 'forest' })]);
    expect(css).toContain("[data-theme='ocean']");
    expect(css).toContain("[data-theme='forest']");
  });

  // Rejecting `+` dropped valid overrides with nothing said about it, and the
  // theme core itself uses that form
  it('accepts every colour function a theme legitimately uses', () => {
    for (const value of [
      'oklch(0.7 0.14 182)',
      'color-mix(in oklab, oklch(0.5 0.1 20) 90%, transparent)',
      'rgb(12 34 56)',
      'hsl(200 50% 40%)',
      'clamp(1rem, 2vw, 3rem)',
      'var(--brand-600)'
    ]) {
      expect(isValidTokenValue(value)).toBe(true);
    }
  });

  it('accepts calc() in both directions', () => {
    expect(isValidTokenValue('calc(var(--radius) + 4px)')).toBe(true);
    expect(isValidTokenValue('calc(var(--radius) - 2px)')).toBe(true);
  });

  it('accepts the value shapes real tokens use', () => {
    const css = customThemeCss([
      theme({
        tokensLight: {
          '--brand-600': 'var(--brand-600)',
          '--radius-md': 'calc(var(--radius) - 0.125rem)',
          '--core-navbar':
            'color-mix(in oklab, oklch(27.4% 0.006 286) 90%, transparent)',
          '--ring': 'oklch(0.705 0.015 286.067 / 50%)'
        }
      })
    ]);
    expect(css).toContain('--brand-600:var(--brand-600)');
    expect(css).toContain('--radius-md:calc(var(--radius) - 0.125rem)');
    expect(css).toContain('90%, transparent)');
    expect(css).toContain('286.067 / 50%)');
  });

  describe('rejects what would escape the block', () => {
    it.each([
      ['ends the declaration', 'red;--foreground:red'],
      ['ends the block', 'red}body{display:none'],
      ['leaves CSS entirely', 'red</style><script>alert(1)</script>'],
      ['smuggles an at-rule', 'red@import url(//evil)'],
      ['overrides everything', 'red!important'],
      ['fetches a remote resource', 'url(https://evil/x)'],
      // Excluding `:` stops the scheme but not a protocol-relative host, which
      // is the same fetch — the original test passed for the wrong reason
      ['fetches without a scheme', 'url(//evil.com/pixel.gif)'],
      ['shouts the function name', 'URL(//evil.com/x)'],
      ['fetches an image set', 'image-set(//evil.com/a.png)'],
      ['fetches a font', 'src(//evil.com/f.woff)'],
      ['hides behind a space', 'url (//evil.com/x)'],
      ['nests the fetch', 'color-mix(in oklab, url(//evil.com/x) 50%, red)']
    ])('%s', (_, value) => {
      expect(isValidTokenValue(value)).toBe(false);
      expect(customThemeCss([theme({ tokensLight: { '--x': value } })])).toBe(
        ''
      );
    });

    it('drops the bad token but keeps the good ones', () => {
      expect(
        customThemeCss([
          theme({
            tokensLight: { '--background': '#fff', '--x': 'red;}body{}' }
          })
        ])
      ).toBe(`[data-theme='ocean']{--background:#fff${TRACK}}`);
    });

    it('drops a slug that would break out of the selector', () => {
      expect(customThemeCss([theme({ slug: "x'],body[x='" })])).toBe('');
    });

    it('drops a value longer than any real token needs', () => {
      expect(isValidTokenValue('a'.repeat(121))).toBe(false);
      expect(isValidTokenValue('a'.repeat(120))).toBe(true);
    });

    it('drops a non-string value', () => {
      expect(isValidTokenValue(42)).toBe(false);
      expect(isValidTokenValue(null)).toBe(false);
      expect(isValidTokenValue('')).toBe(false);
    });
  });

  describe('token names', () => {
    it.each(['--background', '--brand-50', '--core-action-btn-shadow'])(
      'accepts %s',
      (name) => expect(isValidTokenName(name)).toBe(true)
    );

    it.each(['background', '-background', '--Background', '--a_b', '--a--b'])(
      'rejects %s',
      (name) => expect(isValidTokenName(name)).toBe(false)
    );
  });

  describe('theme slugs', () => {
    it.each(['ocean', 'deep-ocean', 'theme2'])('accepts %s', (slug) =>
      expect(isValidThemeSlug(slug)).toBe(true)
    );

    // Indistinguishable from the colour scheme once on `data-theme`
    it.each(['light', 'dark'])('rejects the reserved name %s', (slug) =>
      expect(isValidThemeSlug(slug)).toBe(false)
    );

    it.each(['Ocean', 'deep ocean', '-ocean', 'ocean-', ''])(
      'rejects %s',
      (slug) => expect(isValidThemeSlug(slug)).toBe(false)
    );
  });
});
