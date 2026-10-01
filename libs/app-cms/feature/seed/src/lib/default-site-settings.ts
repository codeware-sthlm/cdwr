import { generateSeedIcon } from '@codeware/shared/ui/seed-icon-studio';
import type { Tenant } from '@codeware/shared/util/payload-types';
import type { TypedLocale } from 'payload';

import type { SiteSettingData } from './local-api/ensure-site-setting';

/** What a tenant gets when its own definition states no site settings. */
export function defaultSiteSettings(
  // `slug` is required here, unlike on `Tenant` itself: the caller always
  // knows it, since it is what found the tenant in the first place
  tenant: Pick<Tenant, 'id' | 'name' | 'description'> & { slug: string },
  { landingPage, locale }: { landingPage: number; locale: TypedLocale }
): SiteSettingData {
  return {
    footer: {
      contact: [
        { platform: 'email', email: `hello@${tenant.slug}.dev` },
        { platform: 'phone', phone: '+46 70 123 45 67' }
      ],
      enabled: true,
      linkSource: 'navigation',
      showVersion: true,
      tagline: tenant.description,
      variant: 'standard'
    },
    forms: {
      notificationRecipients: [{ email: `hello@${tenant.slug}.dev` }]
    },
    general: {
      appName: `${tenant.name} App`,
      icon: {
        source: 'svg',
        svgCode: generateSeedIcon(tenant.name, {
          shape: 'circular',
          style: 'tech',
          techTheme: 'current'
        })
      },
      landingPage,
      defaultLocale: locale,
      themes: ['spotlight', 'codeware'],
      defaultTheme: 'spotlight',
      colorScheme: 'system',
      chrome: 'outlined'
    },
    tenant: tenant.id
  };
}
