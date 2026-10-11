import { colorPickerField } from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { SpacingBlock } from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

import { blockImages } from '../block-images';

const isDivider: Condition<TypeWithID, SpacingBlock> = (_, siblingData) =>
  siblingData?.divider === true;

/**
 * Spacing block for adding an empty space between blocks.
 *
 * Optionally add a horizontal divider with a custom color.
 */
export const spacingBlock: Block = {
  slug: 'spacing',
  admin: {
    images: blockImages(
      'spacing',
      'Two text sections with a vertical gap between them'
    )
  },
  interfaceName: 'SpacingBlock',
  labels: {
    plural: { en: 'Empty Spacing', sv: 'Tomrum' },
    singular: { en: 'Empty Spacing', sv: 'Tomrum' }
  },
  fields: [
    {
      type: 'select',
      name: 'size',
      enumName: enumName('spacing_size'),
      label: {
        en: 'Size',
        sv: 'Storlek'
      },
      admin: {
        description: {
          en: 'Regular spacing size matches the default spacing between blocks',
          sv: '"Regular" matchar det normala avståndet som finns mellan block'
        }
      },
      options: [
        { label: { en: 'Tight', sv: 'Kompakt' }, value: 'tight' },
        { label: { en: 'Regular', sv: 'Normal' }, value: 'regular' },
        { label: { en: 'Loose', sv: 'Luftig' }, value: 'loose' }
      ],
      required: true,
      defaultValue: 'regular'
    },
    {
      type: 'row',
      fields: [
        {
          type: 'checkbox',
          name: 'divider',
          label: {
            en: 'Horizontal divider',
            sv: 'Horisontell linje'
          }
        },
        colorPickerField({
          props: { hideLabel: true },
          override: {
            admin: {
              description: {
                en: 'Override divider theme color',
                sv: 'Sätt en annan färg än temats för divider'
              },
              condition: isDivider
            }
          }
        })
      ]
    }
  ]
};
