import {
  sectionBandField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Gallery block — a heading above a set of photos, as a scrapbook collage or an
 * even row with captions.
 *
 * `image` is required on every item: a photo wall with an empty frame is a
 * hole in the page, and there is nothing a renderer could honestly draw in its
 * place. Remove the item instead.
 *
 * Captions belong to the row layout only. A scrapbook speaks through the
 * pictures and the way they are laid out; text under each would turn it back
 * into a list. Sizes are the mirror image: an even row has no use for them.
 */
export const galleryBlock: Block = {
  slug: 'gallery',
  admin: {
    images: blockImages('gallery', 'A heading above a collage of photos')
  },
  interfaceName: 'GalleryBlock',
  labels: {
    singular: { en: 'Gallery', sv: 'Galleri' },
    plural: { en: 'Galleries', sv: 'Gallerier' }
  },
  fields: [
    ...sectionHeaderFields({ headingRequired: false }),
    {
      name: 'layout',
      type: 'select',
      enumName: enumName('gallery_layout'),
      defaultValue: 'collage',
      label: { en: 'Layout', sv: 'Layout' },
      options: [
        { label: { en: 'Collage', sv: 'Kollage' }, value: 'collage' },
        { label: { en: 'Row', sv: 'Rad' }, value: 'row' }
      ],
      admin: {
        description: {
          en: 'Collage lays the photos out like a scrapbook, each a little askew, sized by the item. Row lines them up evenly, with a caption under each.',
          sv: 'Kollage lägger bilderna som i en klippbok, lite på sned, i den storlek varje bild anger. Rad radar upp dem jämnt, med en bildtext under var och en.'
        }
      }
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      label: { en: 'Photos', sv: 'Bilder' },
      labels: {
        singular: { en: 'Photo', sv: 'Bild' },
        plural: { en: 'Photos', sv: 'Bilder' }
      },
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          filterOptions: {
            mimeType: { contains: 'image' }
          },
          label: { en: 'Image', sv: 'Bild' },
          required: true
        },
        {
          name: 'size',
          type: 'select',
          enumName: enumName('gallery_item_size'),
          defaultValue: 'normal',
          label: { en: 'Size', sv: 'Storlek' },
          options: [
            { label: { en: 'Normal', sv: 'Normal' }, value: 'normal' },
            { label: { en: 'Wide', sv: 'Bred' }, value: 'wide' },
            { label: { en: 'Tall', sv: 'Hög' }, value: 'tall' }
          ],
          admin: {
            // In an array row the parent block's fields are on `blockData`
            condition: (_, __, { blockData }) =>
              blockData?.layout === 'collage',
            description: {
              en: 'Wide takes two columns, tall two rows.',
              sv: 'Bred tar två kolumner, hög två rader.'
            }
          }
        },
        {
          name: 'caption',
          type: 'text',
          localized: true,
          label: { en: 'Caption', sv: 'Bildtext' },
          admin: {
            condition: (_, __, { blockData }) => blockData?.layout === 'row'
          }
        }
      ]
    },
    sectionBandField()
  ]
};
