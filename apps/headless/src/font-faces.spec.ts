import { describe, expect, it } from 'vitest';

import { siteFontFaceCss } from './font-faces';

const named = [
  {
    tokensLight: { '--core-font-heading': 'Nasalization, sans-serif' },
    tokensDark: {}
  }
];
const BASE = 'https://fonts.example.com/';

describe('siteFontFaceCss', () => {
  it('writes the face of a licensed font the deployment is entitled to', () => {
    const css = siteFontFaceCss([], named, 'nasalization', BASE);

    expect(css).toContain('@font-face{font-family:Nasalization;');
    expect(css).toContain(
      'https://fonts.example.com/nasalization-rg-webfont.woff2'
    );
  });

  it('writes nothing without an entitlement', () => {
    expect(siteFontFaceCss([], named, undefined, BASE)).toBe('');
    expect(siteFontFaceCss([], named, 'other', BASE)).toBe('');
  });

  it('writes nothing without an assets base', () => {
    expect(siteFontFaceCss([], named, 'nasalization', undefined)).toBe('');
  });

  it('writes nothing when no theme names a self-served face', () => {
    expect(siteFontFaceCss(['unknown-theme'], [], 'nasalization', BASE)).toBe(
      ''
    );
  });
});
