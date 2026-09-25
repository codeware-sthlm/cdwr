import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { Navigation } from '@codeware/shared/util/payload-types';
import type { CollectionConfig, Condition } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

/**
 * Whether a custom label source is selected.
 */
const isCustomLabelSource: Condition<
  Navigation,
  NonNullable<Navigation['items']>[number]
> = (_, siblingData) => siblingData.labelSource === 'custom';

/**
 * Navigation collection.
 */
const navigation: CollectionConfig = {
  slug: 'navigation',
  admin: {
    group: adminGroups.settings,
    description: {
      en: "Decide what appears in your website's menu and in what order.",
      sv: 'Bestäm vad som visas i webbplatsens meny och i vilken ordning.'
    },
    // Hide from regular users
    hidden: ({ user }) => hasNoAdminRoles(user)
  },
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess({ adminOnly: true }),
    update: userOnlyAccess({ adminOnly: true }),
    delete: userOnlyAccess({ adminOnly: true })
  },
  labels: {
    singular: { en: 'Navigation', sv: 'Navigation' },
    plural: { en: 'Navigation', sv: 'Navigation' }
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      interfaceName: 'NavigationArrayItems',
      label: { en: 'Navigation Tree', sv: 'Navigationsträd' },
      labels: {
        singular: { en: 'Navigation item', sv: 'Navigationsobjekt' },
        plural: { en: 'Navigation items', sv: 'Navigationsobjekt' }
      },
      fields: [
        {
          name: 'reference',
          type: 'relationship',
          label: {
            en: 'Navigate to',
            sv: 'Navigera till'
          },
          relationTo: ['pages', 'posts'],
          required: true
        },
        {
          name: 'labelSource',
          type: 'radio',
          label: false,
          admin: {
            layout: 'horizontal'
          },
          enumName: enumName('navigation_label_source'),
          defaultValue: 'document',
          options: [
            {
              label: {
                en: 'Use document name as link label',
                sv: 'Använd dokumentets namn som länktext'
              },
              value: 'document'
            },
            {
              label: { en: 'Custom link label', sv: 'Anpassad länktext' },
              value: 'custom'
            }
          ]
        },
        {
          name: 'customLabel',
          type: 'text',
          label: { en: 'Link label', sv: 'Länktext' },
          admin: {
            condition: isCustomLabelSource
          },
          required: true
        },
        {
          name: 'appearance',
          type: 'radio',
          label: { en: 'Appearance', sv: 'Utseende' },
          admin: {
            layout: 'horizontal',
            description: {
              en: 'A button stands out from the other links, for the one action you want a visitor to take. The footer lists it as a link.',
              sv: 'En knapp sticker ut från de andra länkarna, för den handling du helst vill att en besökare gör. I sidfoten visas den som en länk.'
            }
          },
          enumName: enumName('navigation_appearance'),
          defaultValue: 'link',
          options: [
            { label: { en: 'Link', sv: 'Länk' }, value: 'link' },
            { label: { en: 'Button', sv: 'Knapp' }, value: 'button' }
          ]
        }
      ],
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@codeware/apps/cms/components/NavigationArrayRowLabel'
        }
      }
    }
  ]
};

export default navigation;
