import type { Tab } from 'payload';

/**
 * Forms tab for site settings.
 *
 * A generic notification recipient for the workspace, used when a form
 * leaves its own "Email To" empty, and how long submissions are kept. Configured once here rather than forcing
 * every form to repeat the same address — see `applyDefaultRecipient`, which
 * reads this to resolve where an unaddressed notification goes.
 */
export const formsTab: Tab = {
  name: 'forms',
  interfaceName: 'SiteSettingsForms',
  label: { en: 'Forms', sv: 'Formulär' },
  admin: {
    description: {
      en: 'Where form notification emails go when a form does not name its own recipient, and how long submissions are kept.',
      sv: 'Vart formulärnotiser går när ett formulär inte anger en egen mottagare, och hur länge inskickade meddelanden sparas.'
    }
  },
  fields: [
    {
      name: 'notificationRecipients',
      type: 'array',
      label: { en: 'Notify these addresses', sv: 'Meddela dessa adresser' },
      labels: {
        singular: { en: 'Address', sv: 'Adress' },
        plural: { en: 'Addresses', sv: 'Adresser' }
      },
      admin: {
        initCollapsed: false,
        description: {
          en: 'Used by any form whose own "Email To" is empty. Leave empty and such a form cannot be saved.',
          sv: 'Används av formulär vars egen "E-post till" är tom. Lämna tom och ett sådant formulär kan inte sparas.'
        }
      },
      fields: [
        {
          name: 'email',
          type: 'email',
          label: false,
          required: true
        }
      ]
    },
    {
      // No default: a default would reach every existing workspace through the
      // migration, and the first nightly sweep would delete their history
      name: 'retentionDays',
      type: 'number',
      label: {
        en: 'Keep submissions for (days)',
        sv: 'Spara inskickade meddelanden i (dagar)'
      },
      min: 1,
      admin: {
        description: {
          en: 'Submissions older than this are deleted every night. Leave empty to keep them until they are deleted by hand. This is also the period the privacy page states.',
          sv: 'Meddelanden som är äldre än så raderas varje natt. Lämna tomt för att spara dem tills de raderas för hand. Det är också den period som integritetssidan anger.'
        }
      }
    }
  ]
};
