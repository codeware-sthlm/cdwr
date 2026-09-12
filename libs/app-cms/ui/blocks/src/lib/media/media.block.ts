import type { Block } from 'payload';

/**
 * Media block for displaying an image media element.
 *
 * Note! Currently only images are supported.
 *
 * @deprecated This block is replaced with `imageBlock` and will be removed in the near future.
 */
export const mediaBlock: Block = {
  slug: 'media',
  interfaceName: 'MediaBlock',
  labels: {
    plural: { en: 'Media', sv: 'Media' },
    singular: { en: 'Media', sv: 'Media' }
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      filterOptions: {
        mimeType: { contains: 'image' }
      },
      required: true
    }
  ]
};
