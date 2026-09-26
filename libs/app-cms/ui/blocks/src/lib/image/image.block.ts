import { sectionBandField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Image block for displaying an image from media collection.
 *
 * Exposes the `ImageBlock` interface.
 */
export const imageBlock: Block = {
  slug: 'image',
  interfaceName: 'ImageBlock',
  labels: {
    plural: { en: 'Images', sv: 'Bilder' },
    singular: { en: 'Image', sv: 'Bild' }
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      filterOptions: {
        mimeType: { contains: 'image' }
      },
      label: { en: 'Image', sv: 'Bild' },
      admin: {
        description: {
          en: 'Select an image.',
          sv: 'Välj en bild.'
        }
      },
      required: true
    },
    sectionBandField()
  ]
};
