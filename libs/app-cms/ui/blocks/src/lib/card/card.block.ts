import {
  colorPickerField,
  iconPickerField,
  linkGroupField,
  sectionBandField
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type {
  CardBlockCard,
  CardBlockLink
} from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

const isLinkEnabled: Condition<TypeWithID, CardBlockCard> = (_, siblingData) =>
  siblingData?.enableLink === true;

const isNavTrigger =
  (
    trigger: CardBlockLink['navTrigger']
  ): Condition<TypeWithID, CardBlockLink> =>
  (_, siblingData) =>
    siblingData?.navTrigger === trigger;

/**
 * Card block for building custom cards with branding and link options.
 */
export const cardBlock: Block = {
  slug: 'card',
  interfaceName: 'CardBlock',
  labels: {
    plural: { en: 'Cards', sv: 'Kort' },
    singular: { en: 'Card', sv: 'Kort' }
  },
  fields: [
    {
      name: 'cards',
      type: 'array',
      labels: {
        singular: {
          en: 'Card',
          sv: 'Kort'
        },
        plural: {
          en: 'Cards',
          sv: 'Kort'
        }
      },
      admin: {
        components: {
          RowLabel:
            '@codeware/app-cms/ui/blocks/card/CardBlockArrayRowLabel.client'
        },
        initCollapsed: true
      },
      fields: [
        {
          name: 'brand',
          type: 'group',
          label: { en: 'Branding', sv: 'Märkning' },
          admin: {
            description: {
              en: 'Select an icon and color that represent the card',
              sv: 'Välj en ikon och färg som representerar kortet'
            },
            hideGutter: true
          },
          fields: [
            {
              type: 'row',
              fields: [
                iconPickerField({
                  props: { hideLabel: true },
                  override: {
                    admin: {
                      width: '25%'
                    }
                  }
                }),
                colorPickerField({
                  props: { hideLabel: true },
                  override: {
                    admin: {
                      width: '25%'
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
          label: {
            en: 'Title',
            sv: 'Titel'
          },
          localized: true,
          required: true
        },
        {
          name: 'description',
          type: 'text',
          label: {
            en: 'Description',
            sv: 'Beskrivning'
          },
          admin: {
            description: {
              en: 'A text that will complement the title',
              sv: 'En text som ska komplettera titeln'
            }
          },
          localized: true
        },
        {
          name: 'content',
          type: 'textarea',
          label: {
            en: 'Main content',
            sv: 'Huvudinnehåll'
          },
          localized: true,
          required: true
        },
        {
          name: 'enableLink',
          type: 'checkbox',
          label: {
            en: 'Card link',
            sv: 'Länk på kortet'
          },
          admin: {
            description: {
              en: 'Let the card link to a page or external URL',
              sv: 'Låt kortet länka till en sida eller en extern URL'
            }
          }
        },
        linkGroupField({
          skipLabel: true,
          overrides: {
            interfaceName: 'CardBlockLink',
            label: false,
            admin: {
              condition: isLinkEnabled,
              disableListColumn: true,
              disableListFilter: true
            }
          },
          customFields: [
            {
              name: 'navTrigger',
              type: 'radio',
              label: {
                en: 'Navigation trigger',
                sv: 'Navigering aktiveras'
              },
              admin: {
                layout: 'horizontal'
              },
              enumName: enumName('nav_trigger'),
              options: [
                {
                  label: {
                    en: 'Click on card',
                    sv: 'Klicka på kortet'
                  },
                  value: 'card'
                },
                {
                  label: {
                    en: 'Click on link',
                    sv: 'Klicka på en länk'
                  },
                  value: 'link'
                }
              ],
              defaultValue: 'card'
            },
            {
              name: 'label',
              type: 'text',
              label: {
                en: 'Link label',
                sv: 'Länk text'
              },
              admin: {
                condition: isNavTrigger('link')
              },
              localized: true,
              required: true
            }
          ]
        })
      ]
    },
    sectionBandField()
  ]
};
