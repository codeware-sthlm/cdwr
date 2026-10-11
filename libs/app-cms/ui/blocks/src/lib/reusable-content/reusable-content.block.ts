import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Reusable content block for selecting the reusable content to render
 */
export const reusableContentBlock: Block = {
  slug: 'reusable-content',
  admin: {
    images: blockImages(
      'reusable-content',
      'Three stacked panels, the middle one marked as shared'
    )
  },
  interfaceName: 'ReusableContentBlock',
  labels: {
    plural: { en: 'Reusable Content', sv: 'Delat Innehåll' },
    singular: { en: 'Reusable Content', sv: 'Delat Innehåll' }
  },
  fields: [
    {
      name: 'reusableContent',
      type: 'relationship',
      relationTo: 'reusable-content',
      required: true
    },
    {
      name: 'refId',
      type: 'text',
      label: {
        en: 'Reference',
        sv: 'Referens'
      },
      admin: {
        description: {
          en: 'Optional reference that can be used to identify this block with CSS or JavaScript.',
          sv: 'Valfri referens som kan användas för att identifiera blocket med CSS eller JavaScript.'
        }
      }
    }
  ]
};
