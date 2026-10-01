import { slugField } from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { canEdit } from '@codeware/app-cms/util/misc';
import type {
  CollectionConfig,
  FieldAccess,
  PayloadRequest,
  TextField,
  Validate
} from 'payload';

import { componentDeveloperAccess } from '../../security/component-developer-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

/** Prefix of the element tag name, which is derived from the slug */
export const COMPONENT_TAG_PREFIX = 'cdwr-x-';

/**
 * A slug that makes a valid custom element name once prefixed: lowercase,
 * starting with a letter, no doubled or trailing dashes.
 */
const componentSlugPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** An identifier an editor-facing prop can be addressed by */
const propNamePattern = /^[a-z][a-zA-Z0-9]*$/;

/** Reuses the slug field's per-tenant uniqueness and dash formatting. */
const base = slugField({ sourceField: 'name', required: true }) as TextField;

const componentSlugField: TextField = {
  ...base,
  maxLength: 48,
  admin: {
    ...base.admin,
    description: {
      en: `Names the component's element, which becomes ${COMPONENT_TAG_PREFIX}<slug>. Generated from the name if left empty.`,
      sv: `Namnger komponentens element, som blir ${COMPONENT_TAG_PREFIX}<kortnamn>. Genereras från namnet om det lämnas tomt.`
    }
  },
  validate: ((value, { req }) => {
    // `required` already reports an empty slug
    if (!value || componentSlugPattern.test(value)) {
      return true;
    }
    return customT((req as PayloadRequest).t)(
      'validation:componentSlugInvalid'
    );
  }) as Validate
};

/** The source is code that runs on the site, so only users may read it. */
const usersOnly: FieldAccess = ({ req: { user } }) => canEdit(user);

/** Only the build job writes these, through the local API. */
const neverWritable = {
  create: () => false,
  update: () => false
} satisfies { create: FieldAccess; update: FieldAccess };

/**
 * Custom components collection
 *
 * Source authored by trusted developers. A server job compiles it to a web
 * component bundle and writes the result to `build`.
 */
const customComponents: CollectionConfig = {
  slug: 'custom-components',
  admin: {
    group: adminGroups.settings,
    defaultColumns: ['name', 'slug', 'build.status', 'build.builtAt'],
    useAsTitle: 'name',
    description: {
      en: 'Components written in code by developers. Editors place them on pages with the Custom component block.',
      sv: 'Komponenter skrivna i kod av utvecklare. Redaktörer placerar dem på sidor med blocket Egen komponent.'
    }
  },
  access: {
    read: userOrApiKeyAccess(),
    create: componentDeveloperAccess(),
    update: componentDeveloperAccess(),
    delete: componentDeveloperAccess()
  },
  labels: {
    singular: { en: 'Custom component', sv: 'Egen komponent' },
    plural: { en: 'Custom components', sv: 'Egna komponenter' }
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', sv: 'Namn' }
    },
    componentSlugField,
    {
      name: 'source',
      type: 'code',
      required: true,
      label: { en: 'Source', sv: 'Källkod' },
      access: { read: usersOnly },
      admin: {
        language: 'typescript',
        description: {
          en: 'The React component, compiled to a web component when saved.',
          sv: 'React-komponenten, som kompileras till en webbkomponent när du sparar.'
        }
      }
    },
    {
      name: 'propsSchema',
      type: 'array',
      label: { en: 'Props', sv: 'Egenskaper' },
      labels: {
        singular: { en: 'Prop', sv: 'Egenskap' },
        plural: { en: 'Props', sv: 'Egenskaper' }
      },
      admin: {
        description: {
          en: 'The values an editor fills in each time the component is placed on a page.',
          sv: 'De värden en redaktör fyller i varje gång komponenten placeras på en sida.'
        }
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: { en: 'Name', sv: 'Namn' },
          admin: {
            description: {
              en: 'The name the component reads the value by.',
              sv: 'Namnet som komponenten läser värdet med.'
            }
          },
          validate: ((value, { req }) =>
            !value || propNamePattern.test(value)
              ? true
              : customT((req as PayloadRequest).t)(
                  'validation:propNameInvalid'
                )) as Validate
        },
        {
          name: 'label',
          type: 'text',
          label: { en: 'Label', sv: 'Etikett' },
          admin: {
            description: {
              en: 'Shown to the editor. Falls back to the name.',
              sv: 'Visas för redaktören. Namnet används om etiketten saknas.'
            }
          }
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'text',
          enumName: enumName('custom_component_prop_type'),
          label: { en: 'Type', sv: 'Typ' },
          options: [
            { label: { en: 'Text', sv: 'Text' }, value: 'text' },
            { label: { en: 'Long text', sv: 'Lång text' }, value: 'textarea' },
            { label: { en: 'Number', sv: 'Tal' }, value: 'number' },
            { label: { en: 'Checkbox', sv: 'Kryssruta' }, value: 'checkbox' }
          ]
        },
        {
          name: 'required',
          type: 'checkbox',
          defaultValue: false,
          label: { en: 'Required', sv: 'Obligatorisk' }
        }
      ]
    },
    {
      name: 'build',
      type: 'group',
      label: { en: 'Build', sv: 'Bygge' },
      access: neverWritable,
      admin: {
        readOnly: true,
        description: {
          en: 'The result of compiling the source. Written by the build, never by hand.',
          sv: 'Resultatet av kompileringen av källkoden. Skrivs av bygget, aldrig för hand.'
        }
      },
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          enumName: enumName('custom_component_build_status'),
          label: { en: 'Status', sv: 'Status' },
          options: [
            { label: { en: 'Pending', sv: 'Väntar' }, value: 'pending' },
            { label: { en: 'Building', sv: 'Bygger' }, value: 'building' },
            { label: { en: 'Ready', sv: 'Klar' }, value: 'ready' },
            { label: { en: 'Failed', sv: 'Misslyckades' }, value: 'failed' }
          ]
        },
        {
          name: 'diagnostics',
          type: 'json',
          label: { en: 'Diagnostics', sv: 'Felmeddelanden' }
        },
        {
          name: 'js',
          type: 'textarea',
          label: { en: 'JavaScript', sv: 'JavaScript' },
          admin: { hidden: true }
        },
        {
          name: 'css',
          type: 'textarea',
          label: { en: 'CSS', sv: 'CSS' },
          admin: { hidden: true }
        },
        {
          name: 'hash',
          type: 'text',
          index: true,
          label: { en: 'Hash', sv: 'Hash' }
        },
        {
          name: 'builtAt',
          type: 'date',
          label: { en: 'Built', sv: 'Byggd' }
        }
      ]
    }
  ]
};

export default customComponents;
