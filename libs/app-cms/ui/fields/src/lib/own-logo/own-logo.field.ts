import { enumName } from '@codeware/app-cms/util/db';
import type { Condition, GroupField, TypeWithID } from 'payload';

type Logo = { source?: 'svg' | 'upload' | null };

const logoSource =
  (source: 'svg' | 'upload'): Condition<TypeWithID, Logo> =>
  (_, siblingData) =>
    siblingData.source === source;

/**
 * A mark of the tenant's own, for a technology the platform's list lacks.
 *
 * SVG code, which can follow the text colour, or an uploaded image, which
 * keeps its own. Offered where a mark from the list is the first choice, so
 * `condition` hides it once one is picked.
 *
 * @param options.enumName - Name of the source enum, unique per block
 * @param options.condition - When to ask for it, from the fields beside it
 */
export const ownLogoField = <TSiblings>({
  enumName: name,
  condition
}: {
  enumName: string;
  condition: Condition<TypeWithID, TSiblings>;
}): GroupField => ({
  name: 'logo',
  type: 'group',
  label: { en: 'Own logo', sv: 'Egen logotyp' },
  admin: { condition: condition },
  fields: [
    {
      name: 'source',
      type: 'select',
      label: { en: 'Source', sv: 'Källa' },
      enumName: enumName(name),
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
});
