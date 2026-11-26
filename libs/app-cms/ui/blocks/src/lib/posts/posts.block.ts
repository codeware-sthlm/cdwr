import { sectionBandField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Posts block for rendering a listing of posts on a page.
 *
 * Data is pre-fetched server-side and passed in at render time.
 */
export const postsBlock: Block = {
  slug: 'posts',
  admin: {
    images: blockImages(
      'posts',
      'Three post rows with a date, a heading and text'
    )
  },
  interfaceName: 'PostsBlock',
  labels: {
    plural: { en: 'Posts Listings', sv: 'Inlägglistor' },
    singular: { en: 'Posts Listing', sv: 'Inlägglista' }
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: { en: 'Title', sv: 'Titel' },
      admin: {
        description: {
          en: 'A section heading. Leave empty when the listing needs none, such as under a hero.',
          sv: 'En rubrik för avsnittet. Lämna tomt när listan inte behöver någon, till exempel under en hero.'
        }
      },
      localized: true
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
      label: { en: 'Max posts', sv: 'Max inlägg' },
      admin: {
        description: {
          en: 'Maximum number of posts to display',
          sv: 'Maximalt antal inlägg att visa'
        }
      },
      min: 1,
      max: 100,
      defaultValue: 10,
      required: true
    },
    {
      name: 'categories',
      type: 'relationship',
      label: { en: 'Categories', sv: 'Kategorier' },
      admin: {
        description: {
          en: 'Show only posts in at least one of these categories. Leave empty to show every post.',
          sv: 'Visa bara inlägg i minst en av dessa kategorier. Lämna tomt för att visa alla inlägg.'
        }
      },
      hasMany: true,
      relationTo: 'categories'
    },
    sectionBandField()
  ]
};
