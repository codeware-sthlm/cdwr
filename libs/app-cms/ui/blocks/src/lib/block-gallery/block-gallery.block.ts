import { sectionHeaderFields } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * Block gallery — every block the platform registers, drawn by the renderer
 * that serves it.
 *
 * The one block whose content is not authored. It reads the generated block
 * registry for what exists and the gallery modules beside each renderer for
 * what to say, so it cannot list a block that will not draw, and a block
 * merged without documentation shows up unwritten rather than not at all.
 *
 * Rendered in a tenant's own theme, it is that tenant's live styleguide.
 */
export const blockGalleryBlock: Block = {
  slug: 'block-gallery',
  interfaceName: 'BlockGalleryBlock',
  labels: {
    singular: { en: 'Block gallery', sv: 'Blockgalleri' },
    plural: { en: 'Block galleries', sv: 'Blockgallerier' }
  },
  fields: [
    ...sectionHeaderFields(),
    {
      name: 'mode',
      type: 'select',
      required: true,
      defaultValue: 'index',
      label: { en: 'Mode', sv: 'Läge' },
      options: [
        {
          label: {
            en: 'Index — every block at once',
            sv: 'Index — alla block'
          },
          value: 'index'
        },
        {
          label: {
            en: 'Browser — one block at a time',
            sv: 'Bläddrare — ett block i taget'
          },
          value: 'browser'
        }
      ],
      admin: {
        description: {
          en: 'The index lists everything registered. The browser shows one block with its fields and an example, and steps to the next.',
          sv: 'Indexet listar allt som är registrerat. Bläddraren visar ett block med dess fält och ett exempel, och stegar vidare till nästa.'
        }
      }
    }
  ]
};
