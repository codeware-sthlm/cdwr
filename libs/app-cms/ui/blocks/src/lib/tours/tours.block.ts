import { sectionBandField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Tours block for rendering a listing of tours on a page.
 *
 * Data is pre-fetched server-side and passed in at render time.
 */
export const toursBlock: Block = {
  slug: 'tours',
  interfaceName: 'ToursBlock',
  labels: {
    plural: { en: 'Tour Listings', sv: 'Reslistor' },
    singular: { en: 'Tour Listing', sv: 'Reslista' }
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: { en: 'Title', sv: 'Titel' },
      localized: true,
      required: true
    },
    {
      name: 'description',
      type: 'textarea',
      label: { en: 'Description', sv: 'Beskrivning' },
      localized: true
    },
    {
      name: 'limit',
      type: 'number',
      label: { en: 'Max tours', sv: 'Max resor' },
      admin: {
        description: {
          en: 'Maximum number of tours to display',
          sv: 'Maximalt antal resor att visa'
        }
      },
      min: 1,
      max: 100,
      defaultValue: 10,
      required: true
    },
    sectionBandField()
  ]
};
