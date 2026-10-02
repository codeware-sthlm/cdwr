import {
  componentPropsField,
  sectionBandField
} from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Places a custom component, with the values for the inputs it declares
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
    componentPropsField,
    sectionBandField()
  ]
};
