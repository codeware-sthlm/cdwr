import {
  linkGroupField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import type { FeatureSectionBlock } from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

const isLinkEnabled: Condition<TypeWithID, FeatureSectionBlock> = (
  _,
  siblingData
) => siblingData?.enableLink === true;

/**
 * Feature section block — a header, one visual, and a row of supporting points.
 *
 * The unit a long marketing page is built from: repeat it and the page is
 * written, which is how the sites this was modelled on are put together. It
 * differs from `showcase` in shape rather than degree — that one is a list of
 * peer items, this one is a single claim with evidence under it.
 *
 * `subFeatures` render as one grouped row rather than as cards. The visual
 * above them is already a bordered object; three more would compete with it
 * when their job is to be subordinate to it.
 */
export const featureSectionBlock: Block = {
  slug: 'feature-section',
  interfaceName: 'FeatureSectionBlock',
  labels: {
    singular: { en: 'Feature section', sv: 'Funktionssektion' },
    plural: { en: 'Feature sections', sv: 'Funktionssektioner' }
  },
  fields: [
    ...sectionHeaderFields(),
    {
      name: 'enableLink',
      type: 'checkbox',
      label: {
        en: 'Show a link below the intro',
        sv: 'Visa en länk under ingressen'
      }
    },
    linkGroupField({
      localizedLabel: true,
      overrides: {
        interfaceName: 'FeatureSectionLink',
        label: false,
        admin: { condition: isLinkEnabled }
      }
    }),
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      filterOptions: {
        mimeType: { contains: 'image' }
      },
      label: { en: 'Visual', sv: 'Bild' },
      admin: {
        description: {
          en: 'The image that carries the claim above it.',
          sv: 'Bilden som bär påståendet ovanför.'
        }
      }
    },
    {
      name: 'subFeatures',
      type: 'array',
      maxRows: 4,
      label: { en: 'Supporting points', sv: 'Stödpunkter' },
      labels: {
        singular: { en: 'Point', sv: 'Punkt' },
        plural: { en: 'Points', sv: 'Punkter' }
      },
      admin: {
        initCollapsed: true,
        description: {
          en: 'Shown as one divided row beneath the visual. Two to four reads best.',
          sv: 'Visas som en delad rad under bilden. Två till fyra fungerar bäst.'
        }
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          label: { en: 'Title', sv: 'Titel' },
          localized: true,
          required: true
        },
        {
          name: 'body',
          type: 'textarea',
          label: { en: 'Body', sv: 'Text' },
          localized: true,
          required: true
        }
      ]
    }
  ]
};
