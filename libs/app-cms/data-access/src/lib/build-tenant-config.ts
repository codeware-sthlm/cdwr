import type {
  CustomThemeConfig,
  Tenant,
  TenantRuntimeConfig
} from '@codeware/shared/util/payload-types';

import {
  FALLBACK_THEME,
  type getSiteSettings
} from './collections/get-site-settings';

type SiteSettings = NonNullable<Awaited<ReturnType<typeof getSiteSettings>>>;

/**
 * Assemble the runtime config a tenant site renders from.
 *
 * Both the local bootstrap and the `tenant-config` endpoint answer with this
 * shape, and a field added to one but not the other is invisible until an
 * external client renders differently from the site it mirrors — so they build
 * it here rather than each on their own.
 *
 * @param settings - Site settings, already normalised by `getSiteSettings`
 * @param customThemes - The tenant's authored themes, if any
 * @param tenant - The authenticated tenant
 */
export function buildTenantConfig({
  settings,
  customThemes,
  tenant
}: {
  settings: SiteSettings;
  customThemes: Array<CustomThemeConfig>;
  tenant: Tenant;
}): TenantRuntimeConfig {
  // Settings saved before these fields existed read back empty, and a stale
  // default may name a theme since deselected. Resolved here rather than in
  // `getSiteSettings` because a site may offer only authored themes, and that
  // list is not visible from the settings document alone.
  const offered = [...settings.themes, ...customThemes.map(({ slug }) => slug)];
  const themes = offered.length ? offered : [FALLBACK_THEME];

  return {
    appName: settings.appName,
    icon: settings.icon,
    locale: settings.defaultLocale,
    fallbackLocale: null,
    landingPage: { collection: 'pages', id: settings.landingPage },
    tenant,
    themes,
    customThemes,
    defaultTheme: themes.includes(settings.defaultTheme)
      ? settings.defaultTheme
      : themes[0],
    colorScheme: settings.colorScheme,
    chrome: settings.chrome
  };
}
