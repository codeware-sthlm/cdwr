import { linkGroupField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Callout block — a compact, centered call-to-action band ("mini hero").
 *
 * An optional brand mark, a heading, a short body, a single action button and
 * an optional image, which turns the band from centred into two columns.
 * The button label comes from the link group's label field.
 */
export const calloutBlock: Block = {
  slug: 'callout',
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
    linkGroupField({
      localizedLabel: true,
      overrides: { interfaceName: 'CalloutLink', label: false }
    })
  ]
};
