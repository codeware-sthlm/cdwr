import { filterByTenantScope } from '@codeware/app-cms/util/filters';
import type { Tab } from 'payload';

/**
 * Legal tab for site settings.
 *
 * The privacy and terms pages belong to the site rather than to tour signups:
 * the footer links them on every page, the signup form and its emails link
 * them too, and the privacy starter describes everything the site collects.
 */
export const legalTab: Tab = {
  name: 'legal',
  interfaceName: 'SiteSettingsLegal',
  label: { en: 'Legal', sv: 'Juridiskt' },
  admin: {
    description: {
      en: 'The privacy and terms pages, linked from the footer on every page and from the tour signup form and its emails.',
      sv: 'Integritets- och villkorssidorna, som länkas från sidfoten på varje sida och från anmälningsformuläret för resor och dess mejl.'
    }
  },
  fields: [
    {
      name: 'privacyPage',
      type: 'relationship',
      relationTo: 'pages',
      label: { en: 'Privacy page', sv: 'Integritetssida' },
      filterOptions: ({ req }) => filterByTenantScope(req, 'pages'),
      admin: {
        description: {
          en: 'Linked from the footer, the tour signup form and the confirmation email. No page yet? Create a starter one below.',
          sv: 'Länkas från sidfoten, anmälningsformuläret och bekräftelsemejlet. Saknar du sida? Skapa ett utkast nedan.'
        }
      }
    },
    {
      name: 'termsPage',
      type: 'relationship',
      relationTo: 'pages',
      label: { en: 'Terms page', sv: 'Villkorssida' },
      filterOptions: ({ req }) => filterByTenantScope(req, 'pages'),
      admin: {
        description: {
          en: 'Linked from the footer. When set, customers must accept these terms before they can sign up for a tour.',
          sv: 'Länkas från sidfoten. När den är vald måste kunder godkänna villkoren innan de kan anmäla sig till en resa.'
        }
      }
    },
    {
      // Sits under the two relationships it fills in
      name: 'legalPageStarters',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@codeware/apps/cms/components/admin/tour-signups/LegalPageStarters.client'
        }
      }
    }
  ]
};
