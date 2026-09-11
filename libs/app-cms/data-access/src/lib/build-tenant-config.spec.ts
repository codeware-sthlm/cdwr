import type {
  CustomThemeConfig,
  Tenant
} from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { buildTenantConfig } from './build-tenant-config';

const tenant = { id: 1, name: 'Acme' } as Tenant;

const settings = (
  overrides: Partial<Parameters<typeof buildTenantConfig>[0]['settings']> = {}
) => ({
  appName: 'Acme',
  colorScheme: 'system' as const,
  chrome: 'outlined' as const,
  customThemeIds: [],
  defaultTheme: 'spotlight',
  defaultLocale: 'en' as const,
  icon: null,
  landingPage: 1,
  themes: ['spotlight'],
  ...overrides
});

const customTheme = (slug: string): CustomThemeConfig => ({
  slug,
  name: slug,
  tokensLight: {},
  tokensDark: {}
});

describe('buildTenantConfig', () => {
  it('offers the built-in themes and the authored ones together', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: ['spotlight', 'codeware'] }),
      customThemes: [customTheme('ocean')],
      tenant
    });

    expect(config.themes).toEqual(['spotlight', 'codeware', 'ocean']);
  });

  // Site settings cannot store an authored name in `defaultTheme`'s enum, so a
  // custom-only site is the case that proves the resolution spans both lists
  it('lets a site offer only authored themes', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: [], defaultTheme: 'ocean' }),
      customThemes: [customTheme('ocean')],
      tenant
    });

    expect(config.themes).toEqual(['ocean']);
    expect(config.defaultTheme).toBe('ocean');
  });

  it('falls back when the site offers nothing at all', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: [], defaultTheme: '' }),
      customThemes: [],
      tenant
    });

    expect(config.themes).toEqual(['spotlight']);
    expect(config.defaultTheme).toBe('spotlight');
  });

  // A theme deselected long after it was made the default would otherwise put a
  // `data-theme` on the page matching no CSS scope
  it('clamps a default that is no longer offered', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: ['codeware'], defaultTheme: 'spotlight' }),
      customThemes: [],
      tenant
    });

    expect(config.defaultTheme).toBe('codeware');
  });

  it('clamps a default naming a deselected authored theme', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: ['spotlight'], defaultTheme: 'ocean' }),
      customThemes: [],
      tenant
    });

    expect(config.defaultTheme).toBe('spotlight');
  });

  it('keeps an authored default that is still offered', () => {
    const config = buildTenantConfig({
      settings: settings({ themes: ['spotlight'], defaultTheme: 'ocean' }),
      customThemes: [customTheme('ocean')],
      tenant
    });

    expect(config.defaultTheme).toBe('ocean');
  });

  it('passes the authored themes through for injection', () => {
    const ocean = customTheme('ocean');
    const config = buildTenantConfig({
      settings: settings(),
      customThemes: [ocean],
      tenant
    });

    expect(config.customThemes).toEqual([ocean]);
  });
});
