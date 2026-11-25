import { linkGroupField, socialLinksField } from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Condition, Tab, TypeWithID } from 'payload';

/**
 * Shape of the footer tab data needed by the field conditions.
 *
 * Declared locally since the generated types are derived from this tab.
 */
type FooterData = {
  enabled?: boolean | null;
  licence?: string | null;
  linkSource?: ('navigation' | 'custom' | 'none') | null;
  showCopyright?: boolean | null;
  variant?: ('compact' | 'standard' | 'expanded') | null;
};

// Conditions never depend on `enabled` — turning the footer off should not
// hide what it is configured to display
const isCustomLinks: Condition<TypeWithID, FooterData> = (_, siblingData) =>
  siblingData?.linkSource === 'custom';

const hasCopyright: Condition<TypeWithID, FooterData> = (_, siblingData) =>
  siblingData?.showCopyright !== false;

const hasLicence: Condition<TypeWithID, FooterData> = (_, siblingData) =>
  Boolean(siblingData?.licence?.trim());

/**
 * Footer tab for site settings.
 *
 * Everything is optional — an untouched footer renders the navigation links
 * and a copyright line based on the application name.
 */
export const footerTab: Tab = {
  name: 'footer',
  interfaceName: 'SiteSettingsFooter',
  label: { en: 'Footer', sv: 'Sidfot' },
  admin: {
    description: {
      en: 'Control what the site footer displays.',
      sv: 'Bestäm vad som visas i webbplatsens sidfot.'
    }
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: { en: 'Show footer', sv: 'Visa sidfot' },
      defaultValue: true,
      admin: {
        description: {
          en: 'Uncheck to hide the footer on all pages.',
          sv: 'Avmarkera för att dölja sidfoten på alla sidor.'
        }
      }
    },
    {
      name: 'variant',
      type: 'radio',
      label: { en: 'Size', sv: 'Storlek' },
      defaultValue: 'standard',
      enumName: enumName('footer_variant'),
      admin: {
        layout: 'horizontal',
        description: {
          en: 'Compact keeps everything on one centered row. Expanded gives the tagline, links and contacts their own columns.',
          sv: 'Kompakt håller allt på en centrerad rad. Utökad ger slogan, länkar och kontaktuppgifter egna kolumner.'
        }
      },
      options: [
        { label: { en: 'Compact', sv: 'Kompakt' }, value: 'compact' },
        { label: { en: 'Standard', sv: 'Standard' }, value: 'standard' },
        { label: { en: 'Expanded', sv: 'Utökad' }, value: 'expanded' }
      ]
    },
    {
      name: 'linkSource',
      type: 'radio',
      label: { en: 'Links', sv: 'Länkar' },
      defaultValue: 'navigation',
      enumName: enumName('footer_link_source'),
      admin: {
        layout: 'horizontal'
      },
      options: [
        {
          label: {
            en: 'Same as top navigation',
            sv: 'Samma som toppnavigeringen'
          },
          value: 'navigation'
        },
        {
          label: { en: 'Custom links', sv: 'Anpassade länkar' },
          value: 'custom'
        },
        {
          label: { en: 'No links', sv: 'Inga länkar' },
          value: 'none'
        }
      ]
    },
    {
      name: 'links',
      type: 'array',
      label: { en: 'Footer links', sv: 'Länkar i sidfoten' },
      labels: {
        singular: { en: 'Link', sv: 'Länk' },
        plural: { en: 'Links', sv: 'Länkar' }
      },
      admin: {
        condition: isCustomLinks,
        description: {
          en: 'Pick the pages worth a footer link — usually fewer than the top navigation.',
          sv: 'Välj de sidor som är värda en länk i sidfoten - vanligtvis färre än i toppnavigeringen.'
        },
        components: {
          RowLabel: '@codeware/apps/cms/components/FooterLinkArrayRowLabel'
        },
        initCollapsed: true
      },
      fields: [linkGroupField({ localizedLabel: true })]
    },
    {
      name: 'tagline',
      type: 'textarea',
      label: { en: 'Tagline', sv: 'Slogan' },
      localized: true,
      admin: {
        description: {
          en: 'Short text above the footer links, e.g. a one-line description of the business.',
          sv: 'Kort text ovanför länkarna, t.ex. en enradig beskrivning av verksamheten.'
        }
      }
    },
    socialLinksField({
      name: 'contact',
      platformEnum: 'footer_contact_platform',
      overrides: {
        label: { en: 'Contact', sv: 'Kontakt' },
        labels: {
          singular: { en: 'Contact', sv: 'Kontaktuppgift' },
          plural: { en: 'Contacts', sv: 'Kontaktuppgifter' }
        },
        admin: {
          description: {
            en: 'Email, phone and social media to display in the footer.',
            sv: 'E-post, telefon och sociala medier som visas i sidfoten.'
          }
        }
      }
    }),
    {
      name: 'showCopyright',
      type: 'checkbox',
      label: { en: 'Show copyright', sv: 'Visa upphovsrätt' },
      defaultValue: true,
      admin: {
        description: {
          en: 'Uncheck to leave the copyright line out of the footer.',
          sv: 'Avmarkera för att utelämna upphovsrättsraden från sidfoten.'
        }
      }
    },
    {
      name: 'copyright',
      type: 'text',
      label: { en: 'Copyright', sv: 'Upphovsrätt' },
      localized: true,
      admin: {
        condition: hasCopyright,
        description: {
          en: 'Use {year} for the current year. Defaults to "© {year} <application name>" when empty.',
          sv: 'Använd {year} för innevarande år. Standard är "© {year} <applikationens namn>" när fältet är tomt.'
        },
        placeholder: '© {year} Acme AB'
      }
    },
    {
      name: 'licence',
      type: 'text',
      label: { en: 'Licence', sv: 'Licens' },
      localized: true,
      admin: {
        description: {
          en: 'A short licence line on the footer’s last row, beside the privacy and terms links. Leave it empty to show none.',
          sv: 'En kort licensrad på sidfotens sista rad, bredvid länkarna till integritet och villkor. Lämna tomt för att inte visa någon.'
        },
        placeholder: 'MIT'
      }
    },
    {
      name: 'licenceUrl',
      type: 'text',
      label: { en: 'Licence link', sv: 'Länk till licensen' },
      admin: {
        condition: hasLicence,
        description: {
          en: 'Optional. Where the licence line leads; an address starting with http opens in a new tab.',
          sv: 'Valfri. Vart licensraden leder; en adress som börjar med http öppnas i en ny flik.'
        }
      }
    },
    {
      name: 'showVersion',
      type: 'checkbox',
      label: {
        en: 'Show application version',
        sv: 'Visa applikationens version'
      },
      admin: {
        description: {
          en: 'Display the running release, e.g. web@1.4.0+ab12cd3.',
          sv: 'Visa den körande utgåvan, t.ex. web@1.4.0+ab12cd3.'
        }
      }
    },
    {
      name: 'backToTop',
      type: 'checkbox',
      label: {
        en: 'Show a back to top link',
        sv: 'Visa en länk tillbaka till toppen'
      },
      admin: {
        description: {
          en: 'A link on the last row that scrolls the page back to the top.',
          sv: 'En länk på sista raden som skrollar sidan tillbaka till toppen.'
        }
      }
    }
  ]
};
