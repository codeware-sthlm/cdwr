import {
  sectionBandField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import { type TechBrand, techIconsMap } from '@codeware/shared/ui/primitives';
import type { Block, Condition, TypeWithID } from 'payload';

type PillRow = {
  icon?: TechBrand | null;
  logo?: { source?: 'svg' | 'upload' | null } | null;
};

const techIconOptions = Object.entries(techIconsMap).map(
  ([value, { name }]) => ({
    label: name,
    value
  })
);

// An own logo is only asked for when no mark from the list is chosen
const withoutIcon: Condition<TypeWithID, PillRow> = (_, siblingData) =>
  !siblingData.icon;

const logoSource =
  (
    source: 'svg' | 'upload'
  ): Condition<TypeWithID, NonNullable<PillRow['logo']>> =>
  (_, siblingData) =>
    siblingData.source === source;

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
        {
          name: 'icon',
          type: 'select',
          label: { en: 'Logo', sv: 'Logotyp' },
          enumName: enumName('pill_list_icon'),
          options: techIconOptions,
          admin: {
            description: {
              en: 'A technology’s own mark, drawn in its brand colour. Leave it empty to add a logo of your own.',
              sv: 'En tekniks eget märke, i dess egen färg. Lämna tomt för att lägga till en egen logotyp.'
            }
          }
        },
        {
          name: 'logo',
          type: 'group',
          label: { en: 'Own logo', sv: 'Egen logotyp' },
          admin: { condition: withoutIcon },
          fields: [
            {
              name: 'source',
              type: 'select',
              label: { en: 'Source', sv: 'Källa' },
              enumName: enumName('pill_list_logo_source'),
              options: [
                { label: { en: 'SVG code', sv: 'SVG-kod' }, value: 'svg' },
                {
                  label: { en: 'Upload image', sv: 'Ladda upp bild' },
                  value: 'upload'
                }
              ]
            },
            {
              name: 'svgCode',
              type: 'textarea',
              label: { en: 'SVG code', sv: 'SVG-kod' },
              admin: {
                condition: logoSource('svg'),
                description: {
                  en: 'Paste the SVG markup, with a viewBox. A part filled with currentColor follows the text colour, so a dark mark stays visible on a dark background.',
                  sv: 'Klistra in SVG-koden, med en viewBox. En del som fylls med currentColor följer textfärgen, så att ett mörkt märke syns även mot mörk bakgrund.'
                }
              }
            },
            {
              name: 'file',
              type: 'upload',
              relationTo: 'media',
              label: { en: 'Image', sv: 'Bild' },
              filterOptions: {
                or: [{ mimeType: { contains: 'image/' } }]
              },
              admin: {
                condition: logoSource('upload'),
                description: {
                  en: 'A square image reads best. An image keeps its colours, so pick one that shows against the block’s background.',
                  sv: 'En kvadratisk bild fungerar bäst. En bild behåller sina färger, så välj en som syns mot blockets bakgrund.'
                }
              }
            }
          ]
        }
      ]
    },
    sectionBandField()
  ]
};
