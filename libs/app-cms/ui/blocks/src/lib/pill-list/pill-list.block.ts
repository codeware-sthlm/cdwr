import {
  ownLogoField,
  sectionBandField,
  sectionHeaderFields,
  techIconField
} from '@codeware/app-cms/ui/fields';
import type { TechBrand } from '@codeware/shared/ui/primitives';
import type { Block, Condition, TypeWithID } from 'payload';

type PillRow = { icon?: TechBrand | null };

// An own logo is only asked for when no mark from the list is chosen
const withoutIcon: Condition<TypeWithID, PillRow> = (_, siblingData) =>
  !siblingData.icon;

/**
 * Pill list block — a header plus a list of labelled pills, each with an
 * optional link and logo. Reusable for packages, tech stacks, tag strips, and
 * more. The logo is a mark from the platform's list or the tenant's own.
 */
export const pillListBlock: Block = {
  slug: 'pill-list',
  interfaceName: 'PillListBlock',
  labels: {
    singular: { en: 'Pill list', sv: 'Etikettlista' },
    plural: { en: 'Pill list', sv: 'Etikettlista' }
  },
  fields: [
    ...sectionHeaderFields(),
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      label: { en: 'Pills', sv: 'Etiketter' },
      labels: {
        singular: { en: 'Pill', sv: 'Etikett' },
        plural: { en: 'Pills', sv: 'Etiketter' }
      },
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'label',
          type: 'text',
          label: { en: 'Label', sv: 'Etikett' },
          admin: {
            description: {
              en: 'e.g. "my-package"',
              sv: 't.ex. "mitt-paket"'
            }
          },
          required: true
        },
        {
          name: 'url',
          type: 'text',
          label: { en: 'URL', sv: 'URL' },
          admin: {
            description: {
              en: 'Optional external link',
              sv: 'Valfri extern länk'
            }
          }
        },
        techIconField({
          name: 'icon',
          label: { en: 'Logo', sv: 'Logotyp' },
          admin: {
            description: {
              en: 'A technology’s own mark, drawn in its brand colour. Leave it empty to add a logo of your own.',
              sv: 'En tekniks eget märke, i dess egen färg. Lämna tomt för att lägga till en egen logotyp.'
            }
          }
        }),
        ownLogoField({
          enumName: 'pill_list_logo_source',
          condition: withoutIcon
        })
      ]
    },
    sectionBandField()
  ]
};
