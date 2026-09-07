import { linkGroupField } from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Block } from 'payload';

/**
 * Hero block — the opening section of a landing page.
 *
 * An optional badge, a large headline, an introduction paragraph, up to two
 * call-to-action buttons and an optional visual beneath them. The brand mark inside the badge is rendered
 * automatically by the component when a tenant icon is available.
 */
export const heroBlock: Block = {
  slug: 'hero',
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
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      filterOptions: { mimeType: { contains: 'image' } },
      label: { en: 'Visual', sv: 'Bild' },
      admin: {
        description: {
          en: 'Shown below the actions. What makes the claim above checkable rather than asserted.',
          sv: 'Visas under knapparna. Det som gör påståendet ovanför kontrollerbart i stället för påstått.'
        }
      }
    },
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
    }
  ]
};
