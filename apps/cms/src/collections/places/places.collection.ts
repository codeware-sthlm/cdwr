import {
  adminGroups,
  managedByField
} from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { validateUrl } from '@payloadcms/richtext-lexical';
import type { CollectionConfig, TextFieldSingleValidation } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';
import { platformLabelField } from '../platform-labels/platform-label.field';

// Inside a row the field type is widened, so the signature needs naming
const validateWebSite: TextFieldSingleValidation = (value, { req }) =>
  !value || validateUrl(value) ? true : customT(req.t)('validation:urlInvalid');

/**
 * Places collection
 *
 * The wineries, hotels and restaurants a tour visits. Authored once and
 * referenced from the itinerary of every tour that stops there, so a changed
 * address or web site is corrected in one place.
 */
const places: CollectionConfig<'places'> = {
  slug: 'places',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['name', 'kind', 'updatedAt'],
    useAsTitle: 'name',
    description: {
      en: 'Wineries, hotels and other places your tours visit. Add a place once and reuse it across tours.',
      sv: 'Vingårdar, hotell och andra platser dina resor besöker. Lägg till en plats en gång och återanvänd den i flera resor.'
    }
  },
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Place', sv: 'Plats' },
    plural: { en: 'Places', sv: 'Platser' }
  },
  fields: [
    managedByField(),
    {
      name: 'name',
      type: 'text',
      label: { en: 'Name', sv: 'Namn' },
      required: true,
      admin: {
        description: {
          en: 'The name of the place, as it should appear in an itinerary.',
          sv: 'Platsens namn, så som det ska visas i en resplan.'
        }
      }
    },
    {
      type: 'row',
      fields: [
        platformLabelField({
          name: 'kind',
          labelType: 'place-kind',
          required: true,
          overrides: {
            label: { en: 'Type', sv: 'Typ' },
            admin: {
              width: '50%',
              description: {
                en: 'What sort of place this is. The list is curated by the platform.',
                sv: 'Vilken sorts plats det är. Listan sköts av plattformen.'
              }
            }
          }
        }),
        {
          name: 'url',
          type: 'text',
          label: { en: 'Web site', sv: 'Webbplats' },
          validate: validateWebSite,
          admin: {
            width: '50%',
            description: {
              en: 'Optional link to the place.',
              sv: 'Valfri länk till platsen.'
            }
          }
        }
      ]
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'Note', sv: 'Anteckning' },
      localized: true,
      admin: {
        description: {
          en: 'A short line about the place, shown next to it in the itinerary.',
          sv: 'En kort rad om platsen, visas bredvid den i resplanen.'
        }
      }
    }
  ]
};

export default places;
