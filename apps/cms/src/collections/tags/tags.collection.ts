import {
  colorPickerField,
  iconPickerField,
  slugField
} from '@codeware/app-cms/ui/fields';
import {
  adminGroups,
  managedByField
} from '@codeware/app-cms/util/definitions';
import type { CollectionConfig } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

/**
 * Tags collection
 */
const tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['name', 'slug'],
    useAsTitle: 'name',
    description: {
      en: 'Labels are used to organize photos and files so they are easy to find and select.',
      sv: 'Etiketter används för att organisera bilder och filer så att de är enkla att hitta och välja.'
    }
  },
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Tag', sv: 'Etikett' },
    plural: { en: 'Tags', sv: 'Etiketter' }
  },
  fields: [
    managedByField(),
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 20,
      label: { en: 'Name', sv: 'Namn' }
    },
    {
      name: 'brand',
      type: 'group',
      label: { en: 'Branding', sv: 'Märkning' },
      admin: {
        description: {
          en: 'Select an icon and color that represent the tag.',
          sv: 'Välj en ikon och färg som representerar etiketten.'
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
      type: 'group',
      name: 'relations',
      virtual: true,
      label: { en: 'The tag is used here', sv: 'Här används etiketten' },
      fields: [
        {
          name: 'relatedMedia',
          label: { en: 'Related Media', sv: 'Relaterad Media' },
          type: 'join',
          collection: 'media',
          on: 'tags',
          admin: { allowCreate: false, disableListColumn: true }
        }
      ]
    },
    slugField({ sourceField: 'name', maxLength: 20 })
  ]
};

export default tags;
