import {
  colorPickerField,
  iconPickerField,
  sectionBandField,
  sectionHeaderFields,
  techIconField
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { Block } from 'payload';

/**
 * Feature cards block — a header plus a grid of icon + title + description
 * cards. Reusable for "Capabilities", "What we do", "Our values", "Benefits",
 * etc. — the editor-facing label is set per use via `labels`.
 *
 * The `columns` variant is the bounded flexibility lever: editors choose the
 * desktop column count, defaulting to `auto` (fits the number of items).
 */
export const featureCardsBlock: Block = {
  slug: 'feature-cards',
  interfaceName: 'FeatureCardsBlock',
  labels: {
    singular: { en: 'Feature cards', sv: 'Funktionskort' },
    plural: { en: 'Feature cards', sv: 'Funktionskort' }
  },
  fields: [
    ...sectionHeaderFields(),
    {
      name: 'columns',
      type: 'select',
      label: { en: 'Columns', sv: 'Kolumner' },
      enumName: enumName('feature_cards_columns'),
      admin: {
        description: {
          en: 'Desktop column count. Auto fits to the number of items.',
          sv: 'Antal kolumner på desktop. Auto anpassar efter antal objekt.'
        }
      },
      options: [
        { label: { en: 'Auto', sv: 'Auto' }, value: 'auto' },
        { label: { en: '2', sv: '2' }, value: '2' },
        { label: { en: '3', sv: '3' }, value: '3' },
        { label: { en: '4', sv: '4' }, value: '4' }
      ],
      defaultValue: 'auto'
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      label: { en: 'Cards', sv: 'Kort' },
      labels: {
        singular: { en: 'Card', sv: 'Kort' },
        plural: { en: 'Cards', sv: 'Kort' }
      },
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'brand',
          type: 'group',
          label: { en: 'Branding', sv: 'Märkning' },
          admin: {
            description: {
              en: 'Icon and color for this item',
              sv: 'Ikon och färg för objektet'
            },
            hideGutter: true
          },
          fields: [
            {
              type: 'row',
              fields: [
                iconPickerField({
                  props: { hideLabel: true },
                  override: { admin: { width: '25%' } }
                }),
                colorPickerField({
                  props: { hideLabel: true },
                  override: { admin: { width: '25%' } }
                }),
                techIconField({
                  name: 'tech',
                  label: { en: 'Or a technology', sv: 'Eller en teknik' },
                  admin: {
                    width: '50%',
                    description: {
                      en: 'Shows the technology’s own mark in its brand colour, in place of the icon.',
                      sv: 'Visar teknikens eget märke i dess egen färg, i stället för ikonen.'
                    }
                  }
                })
              ]
            }
          ]
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
        }
      ]
    },
    sectionBandField()
  ]
};
