import {
  linkGroupField,
  sectionBandField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import type { ShowcaseBlock } from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

const isHeaderLinkEnabled: Condition<TypeWithID, ShowcaseBlock> = (
  _,
  siblingData
) => siblingData?.enableHeaderLink === true;

/**
 * Showcase block — a header plus a list of highlighted rows (tag, title,
 * description, a monospace meta line and a link). Reusable for "Selected Work",
 * "Case studies", "Projects". Mirrors the `card` block's enable-link pattern
 * for the optional header link.
 */
export const showcaseBlock: Block = {
  slug: 'showcase',
  interfaceName: 'ShowcaseBlock',
  labels: {
    singular: { en: 'Showcase', sv: 'Showcase' },
    plural: { en: 'Showcase', sv: 'Showcase' }
  },
  fields: [
    ...sectionHeaderFields(),
    {
      name: 'enableHeaderLink',
      type: 'checkbox',
      label: {
        en: 'Show link in the header',
        sv: 'Visa länk i rubriken'
      }
    },
    linkGroupField({
      localizedLabel: true,
      overrides: {
        interfaceName: 'ShowcaseHeaderLink',
        label: false,
        admin: { condition: isHeaderLinkEnabled }
      }
    }),
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      label: { en: 'Items', sv: 'Objekt' },
      labels: {
        singular: { en: 'Item', sv: 'Objekt' },
        plural: { en: 'Items', sv: 'Objekt' }
      },
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'tag',
          type: 'text',
          label: { en: 'Tag', sv: 'Etikett' },
          admin: {
            description: {
              en: 'Small badge, e.g. "Platform"',
              sv: 'Liten etikett, t.ex. "Plattform"'
            }
          },
          localized: true
        },
        {
          name: 'title',
          type: 'text',
          label: { en: 'Title', sv: 'Titel' },
          localized: true,
          required: true
        },
        {
          name: 'description',
          type: 'textarea',
          label: { en: 'Description', sv: 'Beskrivning' },
          localized: true,
          required: true
        },
        {
          name: 'meta',
          type: 'text',
          label: { en: 'Meta', sv: 'Meta' },
          admin: {
            description: {
              en: 'Monospace line, e.g. "Nx · Payload · Postgres"',
              sv: 'Monospace-rad, t.ex. "Nx · Payload · Postgres"'
            }
          }
        },
        linkGroupField({
          localizedLabel: true,
          overrides: { interfaceName: 'ShowcaseItemLink', label: false }
        })
      ]
    },
    sectionBandField()
  ]
};
