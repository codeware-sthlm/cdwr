import { sectionBandField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Places a custom component, with the values for the props it declares
 */
export const customComponentBlock: Block = {
  slug: 'custom-component',
  interfaceName: 'CustomComponentBlock',
  labels: {
    plural: { en: 'Custom components', sv: 'Egna komponenter' },
    singular: { en: 'Custom component', sv: 'Egen komponent' }
  },
  fields: [
    {
      name: 'component',
      type: 'relationship',
      relationTo: 'custom-components',
      required: true,
      label: { en: 'Component', sv: 'Komponent' }
    },
    {
      name: 'props',
      type: 'json',
      label: { en: 'Props', sv: 'Egenskaper' },
      admin: {
        description: {
          en: 'The values for the props the component declares.',
          sv: 'Värdena för de egenskaper komponenten deklarerar.'
        }
      }
    },
    sectionBandField()
  ]
};
