import { sectionBandField } from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Block, TextFieldSingleValidation } from 'payload';

import { blockImages } from '../block-images';

/** Empty is fine unless the block is an overlay, which a link must reach */
const validateAnchor: TextFieldSingleValidation = (value, { siblingData }) => {
  if (!value) {
    return (siblingData as { display?: string } | undefined)?.display ===
      'overlay'
      ? 'An overlay needs an anchor to be opened by'
      : true;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? true
    : 'Lowercase letters, digits and dashes only';
};

/**
 * Form block for building a custom form.
 *
 * Drawn on the page, or kept as an overlay that a link to its anchor
 * (`#anchor`) opens beside the page.
 */
export const formBlock: Block = {
  slug: 'form',
  admin: {
    images: blockImages('form', 'A form with three fields and a button')
  },
  interfaceName: 'FormBlock',
  labels: {
    plural: { en: 'Form', sv: 'Formulär' },
    singular: { en: 'Forms', sv: 'Formulär' }
  },
  fields: [
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      required: true
    },
    {
      name: 'enableIntro',
      type: 'checkbox',
      label: {
        en: 'Add an introduction to the form',
        sv: 'Lägg till en introduktion till formuläret'
      }
    },
    {
      name: 'introContent',
      type: 'richText',
      label: { en: 'Introduction', sv: 'Introduktion' },
      admin: {
        condition: (_, { enableIntro }) => Boolean(enableIntro)
      }
    },
    {
      name: 'display',
      type: 'select',
      enumName: enumName('form_display'),
      label: { en: 'Display', sv: 'Visning' },
      defaultValue: 'inline',
      options: [
        { label: { en: 'On the page', sv: 'På sidan' }, value: 'inline' },
        { label: { en: 'Overlay', sv: 'Överlägg' }, value: 'overlay' }
      ],
      admin: {
        description: {
          en: 'On the page draws the form where the block sits. Overlay keeps it hidden until a link to #anchor opens it beside the page, as a panel on a wide screen and a sheet from the bottom on a phone.',
          sv: 'På sidan ritar formuläret där blocket ligger. Överlägg håller det dolt tills en länk till #ankare öppnar det bredvid sidan, som en panel på bred skärm och ett ark nedifrån på en telefon.'
        }
      }
    },
    {
      name: 'anchor',
      type: 'text',
      label: { en: 'Anchor', sv: 'Ankare' },
      admin: {
        description: {
          en: 'What a link reaches the form by, as #anchor. Lowercase letters, digits and dashes.',
          sv: 'Det en länk når formuläret genom, som #ankare. Små bokstäver, siffror och bindestreck.'
        }
      },
      validate: validateAnchor
    },
    {
      name: 'overlayTitle',
      type: 'text',
      localized: true,
      label: { en: 'Overlay title', sv: 'Överläggets rubrik' },
      admin: {
        condition: (_, siblingData) => siblingData?.display === 'overlay',
        description: {
          en: 'The heading of the panel. Empty means the form’s own title.',
          sv: 'Panelens rubrik. Tomt betyder formulärets egen titel.'
        }
      }
    },
    sectionBandField()
  ]
};
