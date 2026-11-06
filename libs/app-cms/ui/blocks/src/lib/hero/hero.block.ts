import {
  illustrationField,
  linkGroupField,
  sectionBandField
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Hero block — the opening section of a landing page.
 *
 * An optional badge, a large headline, an introduction paragraph, up to two
 * call-to-action buttons and an optional visual beneath them. The brand mark inside the badge is rendered
 * automatically by the component when a tenant icon is available.
 *
 * The `fill` layout centres the text and fills the screen under the header,
 * with no visual (the visual fields are hidden). An optional decoration is
 * drawn along the bottom edge in either layout.
 */
export const heroBlock: Block = {
  slug: 'hero',
  admin: {
    images: blockImages(
      'hero',
      'A pill, a large headline, text and two buttons'
    )
  },
  interfaceName: 'HeroBlock',
  labels: {
    singular: { en: 'Hero', sv: 'Hero' },
    plural: { en: 'Hero', sv: 'Hero' }
  },
  fields: [
    {
      name: 'badge',
      type: 'text',
      label: { en: 'Badge', sv: 'Etikett' },
      admin: {
        description: {
          en: 'Optional pill above the headline. The tenant logo is shown automatically when available.',
          sv: 'Valfri etikett ovanför rubriken. Arbetsgruppens logotyp visas automatiskt när den är tillgänglig.'
        }
      },
      localized: true
    },
    {
      name: 'heading',
      type: 'text',
      label: { en: 'Headline', sv: 'Rubrik' },
      localized: true,
      required: true
    },
    {
      name: 'lede',
      type: 'textarea',
      label: { en: 'Introduction', sv: 'Introduktion' },
      admin: {
        description: {
          en: 'The part that hooks the reader and conveys the most essential information (often answering who, what, when, where, why).',
          sv: 'Den del som fångar läsaren och förmedlar den mest väsentliga informationen (ofta svar på vem, vad, när, var, varför).'
        }
      },
      localized: true,
      required: true
    },
    {
      name: 'layout',
      type: 'select',
      label: { en: 'Layout', sv: 'Layout' },
      enumName: enumName('hero_layout'),
      options: [
        { label: { en: 'Standard', sv: 'Standard' }, value: 'standard' },
        { label: { en: 'Fill the screen', sv: 'Fyll skärmen' }, value: 'fill' }
      ],
      defaultValue: 'standard',
      admin: {
        description: {
          en: 'Standard sets the text to the left with a visual beneath. Fill centres the text and makes the block fill the screen under the header, with no visual.',
          sv: 'Standard placerar texten till vänster med en bild under. Fyll centrerar texten och låter blocket fylla skärmen under sidhuvudet, utan bild.'
        }
      }
    },
    {
      name: 'decoration',
      type: 'select',
      label: { en: 'Decoration', sv: 'Dekoration' },
      enumName: enumName('hero_decoration'),
      options: [
        { label: { en: 'None', sv: 'Ingen' }, value: 'none' },
        {
          label: { en: 'Horizon lines', sv: 'Horisontlinjer' },
          value: 'horizon-lines'
        }
      ],
      defaultValue: 'none',
      admin: {
        description: {
          en: 'A static drawing in the theme’s own colour along the bottom of the block, fading upward.',
          sv: 'En stillbild i temats egen färg längs blockets nederkant, som tonar uppåt.'
        }
      }
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      filterOptions: { mimeType: { contains: 'image' } },
      label: { en: 'Visual', sv: 'Bild' },
      admin: {
        condition: (_, siblingData) => siblingData?.layout !== 'fill',
        description: {
          en: 'Shown below the actions. What makes the claim above checkable rather than asserted.',
          sv: 'Visas under knapparna. Det som gör påståendet ovanför kontrollerbart i stället för påstått.'
        }
      }
    },
    // The field takes no overrides, so its admin config is extended here
    (() => {
      const field = illustrationField();
      return {
        ...field,
        admin: {
          ...field.admin,
          condition: (_, siblingData) => siblingData?.layout !== 'fill'
        }
      };
    })(),
    {
      name: 'actions',
      type: 'array',
      label: { en: 'Actions', sv: 'Åtgärder' },
      labels: {
        singular: { en: 'Action', sv: 'Åtgärd' },
        plural: { en: 'Actions', sv: 'Åtgärder' }
      },
      maxRows: 2,
      admin: { initCollapsed: true },
      fields: [
        linkGroupField({
          localizedLabel: true,
          overrides: { interfaceName: 'HeroActionLink', label: false }
        }),
        {
          name: 'emphasis',
          type: 'select',
          label: { en: 'Emphasis', sv: 'Betoning' },
          enumName: enumName('hero_action_emphasis'),
          options: [
            { label: { en: 'Primary', sv: 'Primär' }, value: 'primary' },
            { label: { en: 'Secondary', sv: 'Sekundär' }, value: 'secondary' }
          ],
          defaultValue: 'primary'
        }
      ]
    },
    sectionBandField()
  ]
};
