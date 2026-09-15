import type { Tab } from 'payload';

/** Kept in step with the copy the signup form shows the customer */
const DEFAULT_RETENTION_DAYS = 365;

/**
 * Tour signups tab for site settings.
 *
 * Signups are personal data, which brings two obligations the platform cannot
 * meet on a tenant's behalf: telling the customer what happens to their
 * details at the moment they hand them over, and not keeping those details
 * longer than the tour needs them. Both are configured once here rather than
 * per tour, since they describe the workspace and not a departure.
 */
export const tourSignupsTab: Tab = {
  name: 'tourSignups',
  interfaceName: 'SiteSettingsTourSignups',
  label: { en: 'Tour signups', sv: 'Reseanmälningar' },
  admin: {
    description: {
      en: 'What customers are told when they sign up for a tour, and how long their details are kept.',
      sv: 'Vad kunder får veta när de anmäler sig till en resa, och hur länge deras uppgifter sparas.'
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
          en: 'Who gets an email when someone signs up for a tour. Leave empty to be told nothing.',
          sv: 'Vem som får ett mejl när någon anmäler sig till en resa. Lämna tom för att inte bli meddelad.'
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
      name: 'retentionDays',
      type: 'number',
      label: {
        en: 'Keep signup details for (days after departure)',
        sv: 'Spara anmälningsuppgifter i (dagar efter avresa)'
      },
      min: 1,
      defaultValue: DEFAULT_RETENTION_DAYS,
      admin: {
        description: {
          en: 'Names, emails and phone numbers are cleared this long after the tour departs. Party sizes and statuses are kept. This number is also what customers are told on the signup form.',
          sv: 'Namn, e-post och telefonnummer rensas så här lång tid efter avresan. Antal personer och status behålls. Siffran är också det kunderna får veta i anmälningsformuläret.'
        }
      }
    }
  ]
};
