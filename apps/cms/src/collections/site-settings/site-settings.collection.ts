import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import {
  findTenantFromCookie,
  hasNoAdminRoles
} from '@codeware/app-cms/util/misc';
import { SITE_THEMES, THEME_LABELS } from '@codeware/shared/theme';
import type {
  SiteSetting,
  SiteSettingsGeneral,
  SiteSettingsIconSource
} from '@codeware/shared/util/payload-types';
import type { CollectionConfig, Condition, PayloadRequest } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';
import { invalidateIconMap } from '../tenants/hooks/populate-icon.hook';

import { sanitizeSvgHook } from './hooks/sanitize-svg.hook';
import { footerTab } from './tabs/footer.tab';
import { formsTab } from './tabs/forms.tab';
import { tourSignupsTab } from './tabs/tour-signups.tab';

const themeOptions = SITE_THEMES.map((value) => ({
  // Proper nouns — the same in both locales
  label: { en: THEME_LABELS[value], sv: THEME_LABELS[value] },
  value
}));

const isSource =
  (
    source: SiteSettingsIconSource
  ): Condition<SiteSetting, SiteSettingsGeneral['icon']> =>
  (_, siblingData) =>
    siblingData?.source === source;

/**
 * Site settings collection.
 */
const siteSettings: CollectionConfig = {
  slug: 'site-settings',
  admin: {
    group: adminGroups.settings,
    description: {
      en: 'Configure the application name, landing page, and optional tenant brand mark.',
      sv: 'Konfigurera applikationens namn, startsida och valfritt varumärke för klienten.'
    },
    // Hide from regular users
    hidden: ({ user }) => hasNoAdminRoles(user)
  },
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess({ adminOnly: true }),
    update: userOnlyAccess({ adminOnly: true }),
    delete: userOnlyAccess({ adminOnly: true })
  },
  hooks: {
    beforeChange: [sanitizeSvgHook],
    // Tenant icons are derived from these settings and cached — drop it on edit
    afterChange: [
      ({ doc }) => {
        invalidateIconMap();
        return doc;
      }
    ]
  },
  labels: {
    singular: { en: 'Site Settings', sv: 'Webbplatsinställningar' },
    plural: { en: 'Site Settings', sv: 'Webbplatsinställningar' }
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          name: 'general',
          interfaceName: 'SiteSettingsGeneral',
          label: { en: 'General', sv: 'Allmänt' },
          fields: [
            {
              name: 'appName',
              type: 'text',
              label: { en: 'Application name', sv: 'Namnet på applikationen' },
              required: true
            },
            {
              name: 'landingPage',
              type: 'relationship',
              relationTo: 'pages',
              hasMany: false,
              label: { en: 'Landing page', sv: 'Startsida' },
              admin: {
                description: {
                  en: 'The page that will be used as the landing page for the application.',
                  sv: 'Sidan som kommer att användas som startsida för applikationen.'
                }
              },
              required: true
            },
            {
              name: 'icon',
              type: 'group',
              label: { en: 'Icon', sv: 'Ikon' },
              admin: {
                description: {
                  en: 'Optional tenant brand mark - use for a more unique identity.',
                  sv: 'Valfritt varumärke för klienten - använd för en mer unik identitet.'
                }
              },
              fields: [
                {
                  name: 'source',
                  type: 'select',
                  label: { en: 'Source', sv: 'Källa' },
                  options: [
                    { label: { en: 'SVG code', sv: 'SVG-kod' }, value: 'svg' },
                    {
                      label: { en: 'Upload image', sv: 'Ladda upp bild' },
                      value: 'upload'
                    }
                  ]
                },
                {
                  name: 'svgCode',
                  type: 'textarea',
                  label: { en: 'SVG code', sv: 'SVG-kod' },
                  admin: {
                    condition: isSource('svg'),
                    description: {
                      en: 'Paste raw SVG markup or generate a geometric icon. The viewBox attribute is required for correct scaling.',
                      sv: 'Klistra in SVG-markup eller generera en geometrisk ikon. Attributet viewBox krävs för korrekt skalning.'
                    },
                    components: {
                      Field:
                        '@codeware/apps/cms/components/SvgPreviewField.client'
                    }
                  }
                },
                {
                  name: 'file',
                  type: 'upload',
                  relationTo: 'media',
                  label: { en: 'Image', sv: 'Bild' },
                  filterOptions: {
                    or: [{ mimeType: { contains: 'image/' } }]
                  },
                  admin: {
                    condition: isSource('upload'),
                    description: {
                      en: 'Upload an image. Use the crop tool to select a 1:1 region.',
                      sv: 'Ladda upp en bild. Använd beskärningsverktyget för att välja ett 1:1-område.'
                    },
                    components: {
                      Field:
                        '@codeware/app-cms/ui/fields/icon-crop/IconCropField.client'
                    }
                  }
                }
              ]
            },
            {
              name: 'themes',
              type: 'select',
              label: { en: 'Themes', sv: 'Teman' },
              admin: {
                description: {
                  en: 'Themes this site may use. Select more than one to give visitors a theme selector.',
                  sv: 'Teman som webbplatsen kan använda. Välj fler än ett för att ge besökarna en temaväljare.'
                }
              },
              enumName: enumName('site_settings_themes'),
              options: themeOptions,
              hasMany: true,
              defaultValue: ['spotlight'],
              // Not `required`: a site may offer only its own themes. What has
              // to hold is that it offers something, which spans both fields
              validate: (
                value: Array<string> | null | undefined,
                {
                  req,
                  siblingData
                }: { req: PayloadRequest; siblingData: unknown }
              ) => {
                const customThemes = (
                  siblingData as SiteSettingsGeneral | undefined
                )?.customThemes;
                if (value?.length || customThemes?.length) {
                  return true;
                }
                return customT(req.t)('validation:themesRequired');
              }
            },
            {
              name: 'customThemes',
              type: 'relationship',
              relationTo: 'custom-themes',
              hasMany: true,
              label: { en: 'Custom themes', sv: 'Egna teman' },
              admin: {
                description: {
                  en: 'Your own themes, offered alongside the ones above. Create them under Custom themes.',
                  sv: 'Dina egna teman, som erbjuds vid sidan av de ovanstående. Skapa dem under Egna teman.'
                }
              }
            },
            {
              name: 'defaultTheme',
              // Text, not select: an authored theme does not exist when the
              // config is built, so no static option list can hold it. The
              // admin component assembles the options from both kinds.
              type: 'text',
              label: { en: 'Default theme', sv: 'Standardtema' },
              admin: {
                description: {
                  en: 'The theme a visitor sees before making a choice. Must be one of the selected themes.',
                  sv: 'Temat en besökare ser innan något val gjorts. Måste vara ett av de valda temana.'
                },
                components: {
                  Field:
                    '@codeware/app-cms/ui/fields/default-theme/DefaultThemeField.client'
                }
              },
              defaultValue: 'spotlight',
              validate: async (
                value: string | null | undefined,
                {
                  req,
                  siblingData
                }: { req: PayloadRequest; siblingData: unknown }
              ) => {
                const data = siblingData as SiteSettingsGeneral | undefined;
                const themes = data?.themes ?? [];

                // The relationship carries ids, so the slugs a visitor could
                // land on have to be read back before this can judge the value
                const customIds = (data?.customThemes ?? [])
                  .map((entry) =>
                    typeof entry === 'number' ? entry : entry?.id
                  )
                  .filter((id): id is number => typeof id === 'number');

                const customSlugs = customIds.length
                  ? (
                      await req.payload.find({
                        collection: 'custom-themes',
                        depth: 0,
                        limit: 0,
                        where: { id: { in: customIds } }
                      })
                    ).docs.map(({ slug }) => slug)
                  : [];

                const selectable = [...themes, ...customSlugs];

                if (
                  !value ||
                  !selectable.length ||
                  selectable.includes(value)
                ) {
                  return true;
                }
                return customT(req.t)('validation:defaultThemeNotSelected', {
                  theme: value,
                  themes: selectable.join(', ')
                });
              },
              required: true
            },
            {
              name: 'colorScheme',
              type: 'select',
              label: { en: 'Appearance', sv: 'Utseende' },
              admin: {
                description: {
                  en: 'Let visitors switch between light and dark, or lock the site to one of them.',
                  sv: 'Låt besökarna växla mellan ljust och mörkt, eller lås webbplatsen till ett av dem.'
                }
              },
              enumName: enumName('site_settings_color_scheme'),
              options: [
                {
                  label: { en: 'Visitor chooses', sv: 'Besökaren väljer' },
                  value: 'system'
                },
                {
                  label: { en: 'Always light', sv: 'Alltid ljust' },
                  value: 'light'
                },
                {
                  label: { en: 'Always dark', sv: 'Alltid mörkt' },
                  value: 'dark'
                }
              ],
              hasMany: false, // Infer correct types for validation
              defaultValue: 'system',
              required: true
            },
            {
              name: 'chrome',
              type: 'select',
              label: { en: 'Header style', sv: 'Sidhuvudets stil' },
              admin: {
                description: {
                  en: 'Whether the menu and the buttons beside it sit in their own frames, or blend into the page.',
                  sv: 'Om menyn och knapparna bredvid den har egna ramar, eller smälter in i sidan.'
                }
              },
              enumName: enumName('site_settings_chrome'),
              options: [
                {
                  label: { en: 'Framed', sv: 'Inramad' },
                  value: 'outlined'
                },
                { label: { en: 'Blended', sv: 'Avskalad' }, value: 'flat' }
              ],
              hasMany: false,
              defaultValue: 'outlined',
              required: true
            },
            {
              name: 'defaultLocale',
              type: 'select',
              options: [
                { label: { en: 'English', sv: 'Engelska' }, value: 'en' },
                { label: { en: 'Swedish', sv: 'Svenska' }, value: 'sv' }
              ],
              hasMany: false, // Infer correct types for validation
              validate: async (value, { req }) => {
                const tenant = await findTenantFromCookie(req);
                if (!tenant || !value) {
                  return true;
                }
                const locales = tenant.supportedLocales.map(String);
                if (locales.includes(value)) {
                  return true;
                }
                return customT(req.t)('validation:notSupportedLocale', {
                  locale: value,
                  locales: locales.join(', ') || 'none'
                });
              },
              label: { en: 'Default locale', sv: 'Primärt språk' },
              admin: {
                description: {
                  en: 'The default locale for the client. Must be one of the supported locales for the workspace.',
                  sv: 'Primärt språk för klienten. Måste vara ett av de språk som stöds av arbetsytan.'
                }
              },
              required: true
            }
          ]
        },
        footerTab,
        tourSignupsTab,
        formsTab
      ]
    }
  ]
};

export default siteSettings;
