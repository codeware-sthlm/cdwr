import { defaultSiteSettings } from './default-site-settings';

const tenant = {
  id: 3,
  name: 'Moon',
  slug: 'moon',
  description: 'A tenant about the moon'
};

describe('defaultSiteSettings', () => {
  it('builds the standard defaults from the tenant', () => {
    const settings = defaultSiteSettings(tenant, {
      landingPage: 7,
      locale: 'en'
    });

    expect(settings).toEqual({
      footer: {
        contact: [
          { platform: 'email', email: 'hello@moon.dev' },
          { platform: 'phone', phone: '+46 70 123 45 67' }
        ],
        enabled: true,
        linkSource: 'navigation',
        showVersion: true,
        tagline: tenant.description,
        variant: 'standard'
      },
      forms: {
        notificationRecipients: [{ email: 'hello@moon.dev' }]
      },
      general: {
        appName: 'Moon App',
        icon: { source: 'svg', svgCode: expect.any(String) },
        landingPage: 7,
        defaultLocale: 'en',
        themes: ['spotlight', 'codeware'],
        defaultTheme: 'spotlight',
        colorScheme: 'system',
        chrome: 'outlined'
      },
      tenant: 3
    });
  });

  it('derives the icon from the tenant name, so two tenants never share one', () => {
    const a = defaultSiteSettings(tenant, { landingPage: 1, locale: 'en' });
    const b = defaultSiteSettings(
      { ...tenant, id: 4, name: 'Star', slug: 'star' },
      { landingPage: 1, locale: 'en' }
    );

    expect(a.general.icon?.svgCode).not.toEqual(b.general.icon?.svgCode);
  });
});
