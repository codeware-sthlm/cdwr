import {
  illustrationField,
  linkGroupField,
  sectionBandField
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
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
      name: 'markStyle',
      type: 'select',
      label: { en: 'Mark colour', sv: 'Märkets färg' },
      enumName: enumName('callout_mark_style'),
      defaultValue: 'brand',
      options: [
        {
          label: { en: 'In the brand colour', sv: 'I varumärkets färg' },
          value: 'brand'
        },
        { label: { en: 'Dimmed', sv: 'Nedtonad' }, value: 'muted' }
      ],
      admin: {
        description: {
          en: 'Dimmed makes the mark smaller and quieter, so the heading leads. The colour only reaches an icon drawn in the text colour; an icon from an uploaded image, or with colours of its own, is only made smaller and lighter.',
          sv: 'Nedtonad gör märket mindre och lugnare, så rubriken leder. Färgen når bara en ikon som är ritad i textfärgen; en ikon från en uppladdad bild, eller med egna färger, görs bara mindre och ljusare.'
        },
        // Hidden only when the mark is switched off; a row from before
        // `showMark` has no value and still shows it
        condition: (_, siblingData) => siblingData?.showMark !== false
      }
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
