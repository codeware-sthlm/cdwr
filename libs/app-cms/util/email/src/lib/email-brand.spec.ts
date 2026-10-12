import type {
  CustomTheme,
  SiteSetting
} from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND, emailBrandFromSettings } from './email-brand';
import { NEUTRAL_ACCENT } from './templates/layout';

const options = {
  serverURL: 'https://titan.example',
  fallbackName: 'Fallback',
  // Shaped like a built-in: `--primary` reaches the palette through an alias
  builtInTokens: {
    frost: { light: { '--primary': 'oklch(0.205 0 0)' } },
    aurora: {
      light: {
        '--primary': 'var(--brand-700)',
        '--brand-700': 'var(--color-cyan-700)'
      }
    }
  }
};

const settings = (
  general: Partial<SiteSetting['general']>
): Pick<SiteSetting, 'general'> => ({
  general: {
    appName: 'Titan Tours',
    landingPage: 1,
    defaultTheme: 'frost',
    ...general
  }
});

const customTheme = (
  slug: string,
  tokensLight: CustomTheme['tokensLight']
): CustomTheme => ({
  id: 1,
  name: slug,
  slug,
  tokensLight,
  updatedAt: '',
  createdAt: ''
});

describe('emailBrandFromSettings', () => {
  it('takes the accent from a built-in theme, through its aliases', () => {
    // sky-700 via var(--color-sky-700)
    const { accent } = emailBrandFromSettings(
      settings({ defaultTheme: 'aurora' }),
      options
    );

    expect(accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(accent).not.toBe(NEUTRAL_ACCENT);
  });

  it('takes the accent from a custom theme', () => {
    const { accent } = emailBrandFromSettings(
      settings({
        defaultTheme: 'mine',
        customThemes: [customTheme('mine', { '--primary': '#0e7490' })]
      }),
      options
    );

    expect(accent).toBe('#0e7490');
  });

  it('falls back when the accent is too faint for white text', () => {
    const { accent } = emailBrandFromSettings(
      settings({
        defaultTheme: 'pale',
        customThemes: [customTheme('pale', { '--primary': '#ffeb3b' })]
      }),
      options
    );

    expect(accent).toBe(NEUTRAL_ACCENT);
  });

  it('falls back when the theme cannot be resolved', () => {
    for (const general of [
      { defaultTheme: 'gone' },
      { defaultTheme: 'mine', customThemes: [1] },
      {
        defaultTheme: 'mine',
        customThemes: [customTheme('mine', { '--primary': 'var(--nope)' })]
      },
      { defaultTheme: 'mine', customThemes: [customTheme('mine', 'broken')] }
    ]) {
      expect(emailBrandFromSettings(settings(general), options).accent).toBe(
        NEUTRAL_ACCENT
      );
    }
  });

  it('points the logo at the site icon when the mark is SVG', () => {
    const brand = emailBrandFromSettings(
      settings({
        icon: { source: 'svg', svgCode: '<svg viewBox="0 0 1 1"/>' }
      }),
      options
    );

    expect(brand.logoUrl).toBe('https://titan.example/site-icon.png?size=64');
  });

  it('has no logo without an icon', () => {
    expect(
      emailBrandFromSettings(settings({}), options).logoUrl
    ).toBeUndefined();
    expect(
      emailBrandFromSettings(
        settings({ icon: { source: 'svg', svgCode: ' ' } }),
        options
      ).logoUrl
    ).toBeUndefined();
  });

  it('has no logo where the app does not serve the tenant icon', () => {
    const { serverURL: _omit, ...hostOptions } = options;
    expect(
      emailBrandFromSettings(
        settings({ icon: { source: 'svg', svgCode: '<svg/>' } }),
        hostOptions
      ).logoUrl
    ).toBeUndefined();
  });

  it('names the brand after the app, or the fallback', () => {
    expect(emailBrandFromSettings(settings({}), options).name).toBe(
      'Titan Tours'
    );
    expect(
      emailBrandFromSettings(settings({ appName: '' }), options).name
    ).toBe('Fallback');
  });
});

describe('PLATFORM_EMAIL_BRAND', () => {
  it('is the neutral platform sender', () => {
    expect(PLATFORM_EMAIL_BRAND).toEqual({
      name: 'Codeware CMS',
      accent: NEUTRAL_ACCENT
    });
  });
});
