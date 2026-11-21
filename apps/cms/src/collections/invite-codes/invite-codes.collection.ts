import { systemUserAccess } from '@codeware/app-cms/util/access';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { hasRole } from '@codeware/app-cms/util/misc';
import type {
  CollectionConfig,
  NumberFieldSingleValidation,
  TextFieldSingleValidation
} from 'payload';

import { protectInviteCode } from './hooks/protect-invite-code.hook';

/** Set by the hook, so a required check before it would always fail */
const setByHook: TextFieldSingleValidation = () => true;

/** A fraction would let the conditional consume admit one use too many */
const wholeNumber: NumberFieldSingleValidation = (value, { req }) =>
  value === null ||
  value === undefined ||
  (Number.isInteger(value) && value >= 1) ||
  customT(req.t)('validation:inviteCodeWholeNumber');

/** Only an existing document has an id, so only it can be edited */
const isNew = (data: { id?: unknown }) => !data.id;

/**
 * Invite codes for self-serve signup.
 *
 * Platform-owned and for system users only: nobody else can list, read or
 * redeem one through the API. The plain code exists for a single request — it
 * is typed or generated on create, split by `protectInviteCode` into a public
 * `lookup` and a hash of the secret half, and never stored.
 */
const inviteCodes: CollectionConfig<'invite-codes'> = {
  slug: 'invite-codes',
  admin: {
    group: adminGroups.settings,
    useAsTitle: 'lookup',
    defaultColumns: ['lookup', 'note', 'uses', 'maxUses', 'expiresAt'],
    description: {
      en: 'Codes that let someone sign up when self-serve signup is open. A code is shown once, when it is created.',
      sv: 'Koder som låter någon registrera sig när egen registrering är öppen. En kod visas bara en gång, när den skapas.'
    },
    hidden: ({ user }) => !hasRole(user, 'system-user')
  },
  access: {
    read: systemUserAccess,
    create: systemUserAccess,
    update: systemUserAccess,
    delete: systemUserAccess
  },
  labels: {
    singular: { en: 'Invite Code', sv: 'Inbjudningskod' },
    plural: { en: 'Invite Codes', sv: 'Inbjudningskoder' }
  },
  hooks: {
    beforeChange: [protectInviteCode]
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      // Not a column: it reaches the hook with the request and goes no further
      virtual: true,
      label: { en: 'Code', sv: 'Kod' },
      admin: {
        readOnly: false,
        condition: isNew,
        description: {
          en: 'Generate a code or type your own, in the form XXXX-XXXX-XXXX-XXXX.',
          sv: 'Skapa en kod eller skriv en egen, på formen XXXX-XXXX-XXXX-XXXX.'
        }
      }
    },
    {
      name: 'codeGenerator',
      type: 'ui',
      admin: {
        condition: isNew,
        components: {
          Field: '@codeware/apps/cms/components/admin/invite-codes/GenerateCode'
        }
      }
    },
    {
      name: 'lookup',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: { en: 'Lookup', sv: 'Uppslag' },
      validate: setByHook,
      admin: {
        readOnly: true,
        condition: (data) => !isNew(data),
        description: {
          en: 'The first half of the code, which is not secret. Identifies the code in this list.',
          sv: 'Kodens första halva, som inte är hemlig. Identifierar koden i den här listan.'
        }
      }
    },
    {
      name: 'codeHash',
      type: 'text',
      required: true,
      validate: setByHook,
      // Never leaves the server, not even to a system user
      access: { read: () => false },
      admin: { hidden: true }
    },
    {
      name: 'maxUses',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      validate: wholeNumber,
      label: { en: 'Max uses', sv: 'Högsta antal användningar' },
      admin: {
        description: {
          en: 'How many times the code can be used.',
          sv: 'Hur många gånger koden kan användas.'
        }
      }
    },
    {
      name: 'uses',
      type: 'number',
      defaultValue: 0,
      min: 0,
      label: { en: 'Uses', sv: 'Användningar' },
      admin: { readOnly: true }
    },
    {
      name: 'expiresAt',
      type: 'date',
      label: { en: 'Expires', sv: 'Giltig till' },
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: {
          en: 'Leave empty for a code that does not expire.',
          sv: 'Lämna tomt för en kod som inte går ut.'
        }
      }
    },
    {
      name: 'note',
      type: 'text',
      required: true,
      label: { en: 'Note', sv: 'Anteckning' },
      admin: {
        description: {
          en: 'Who the code is for.',
          sv: 'Vem koden är till.'
        }
      }
    }
  ]
};

export default inviteCodes;
