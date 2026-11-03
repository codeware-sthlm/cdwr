import {
  illustrationField,
  linkGroupField,
  sectionBandField
} from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Callout block — a compact, centered call-to-action band ("mini hero").
 *
 * An optional brand mark, a heading, a short body, a single action button and
 * an optional image, which turns the band from centred into two columns.
 * The button is optional; its label comes from the link group's label field.
 */
export const calloutBlock: Block = {
  slug: 'callout',
  admin: {
    images: blockImages(
      'callout',
      'A centered panel with an icon, a heading, a line of text and a button'
    )
  },
  interfaceName: 'CalloutBlock',
  labels: {
    singular: { en: 'Callout', sv: 'Callout' },
    plural: { en: 'Callout', sv: 'Callout' }
  },
  fields: [
    {
      name: 'showMark',
      type: 'checkbox',
      label: { en: 'Show brand mark', sv: 'Visa varumärke' },
      defaultValue: true
    },
    {
      name: 'heading',
      type: 'text',
      label: { en: 'Heading', sv: 'Rubrik' },
      localized: true,
      required: true
    },
    {
      name: 'body',
      type: 'textarea',
      label: { en: 'Body', sv: 'Text' },
      localized: true
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      filterOptions: { mimeType: { contains: 'image' } },
      label: { en: 'Image', sv: 'Bild' },
      admin: {
        description: {
          en: 'Optional. Sits beside the text and turns the band into a two-column section.',
          sv: 'Valfri. Placeras bredvid texten och gör bandet tvåspaltigt.'
        }
      }
    },
    illustrationField(),
    {
      name: 'showLink',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Show a button', sv: 'Visa en knapp' },
      admin: {
        description: {
          en: 'Uncheck for a band that says something without asking for a click.',
          sv: 'Avmarkera för ett band som säger något utan att be om ett klick.'
        }
      }
    },
    linkGroupField({
      localizedLabel: true,
      overrides: {
        interfaceName: 'CalloutLink',
        label: false,
        // A row from before the field has no value and keeps its button
        admin: {
          condition: (_, siblingData) => siblingData?.showLink !== false
        }
      }
    }),
    sectionBandField()
  ]
};
