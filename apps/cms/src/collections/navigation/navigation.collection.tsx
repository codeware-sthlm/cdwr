import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { Navigation } from '@codeware/shared/util/payload-types';
import type {
  ArrayField,
  CollectionConfig,
  Condition,
  RadioField,
  RelationshipField
} from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

type Item = NonNullable<Navigation['items']>[number];

/**
 * Whether the item is a link to a page or post; an item saved before groups
 * existed has no type and is a link.
 */
const isLink: Condition<Navigation, Item> = (_, siblingData) =>
  siblingData.type !== 'group';

/**
 * Whether the item is a group of links.
 */
const isGroup: Condition<Navigation, Item> = (_, siblingData) =>
  siblingData.type === 'group';

/**
 * Whether a link item uses a custom label.
 */
const isCustomLinkLabel: Condition<Navigation, Item> = (_, siblingData) =>
  siblingData.type !== 'group' && siblingData.labelSource === 'custom';

/**
 * Whether a group child uses a custom label.
 */
const isCustomChildLabel: Condition<
  Navigation,
  NonNullable<Item['children']>[number]
> = (_, siblingData) => siblingData.labelSource === 'custom';

const rowLabel = {
  RowLabel: '@codeware/apps/cms/components/NavigationArrayRowLabel'
};

/**
 * Where an item points, shared by links and group children.
 */
const referenceField: RelationshipField = {
  name: 'reference',
  type: 'relationship',
  label: {
    en: 'Navigate to',
    sv: 'Navigera till'
  },
  relationTo: ['pages', 'posts']
};

const labelSourceField: RadioField = {
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
};

/**
 * Links under a group.
 */
const childrenField: ArrayField = {
  name: 'children',
  type: 'array',
  interfaceName: 'NavigationArrayChildren',
  labels: {
    singular: { en: 'Link', sv: 'Länk' },
    plural: { en: 'Links', sv: 'Länkar' }
  },
  admin: {
    condition: isGroup,
    initCollapsed: true,
    components: rowLabel
  },
  fields: [
    { ...referenceField, required: true },
    labelSourceField,
    {
      name: 'customLabel',
      type: 'text',
      label: { en: 'Link label', sv: 'Länktext' },
      admin: {
        condition: isCustomChildLabel
      },
      required: true
    }
  ]
};

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
          name: 'type',
          type: 'radio',
          label: false,
          admin: {
            layout: 'horizontal',
            description: {
              en: 'A group is a label in the menu that opens to its links; it is not a page itself.',
              sv: 'En grupp är en rubrik i menyn som öppnar sina länkar; den är inte en sida i sig.'
            }
          },
          enumName: enumName('navigation_items_type'),
          defaultValue: 'link',
          options: [
            { label: { en: 'Link', sv: 'Länk' }, value: 'link' },
            { label: { en: 'Group', sv: 'Grupp' }, value: 'group' }
          ]
        },
        {
          ...referenceField,
          // Validated only while shown: a group has no reference
          admin: { condition: isLink },
          required: true
        },
        {
          ...labelSourceField,
          admin: { layout: 'horizontal', condition: isLink }
        },
        {
          name: 'customLabel',
          type: 'text',
          label: { en: 'Link label', sv: 'Länktext' },
          admin: {
            condition: isCustomLinkLabel
          },
          required: true
        },
        {
          name: 'appearance',
          type: 'radio',
          label: { en: 'Appearance', sv: 'Utseende' },
          admin: {
            condition: isLink,
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
        },
        {
          name: 'label',
          type: 'text',
          label: { en: 'Group label', sv: 'Gruppens rubrik' },
          admin: { condition: isGroup },
          required: true
        },
        childrenField
      ],
      admin: {
        initCollapsed: true,
        components: rowLabel
      }
    }
  ]
};

export default navigation;
