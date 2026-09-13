import {
  domainsField,
  guardDomainConflicts,
  normalizeDomains
} from '@codeware/app-cms/feature/domains';
import { slugField } from '@codeware/app-cms/ui/fields';
import { systemUserAccess } from '@codeware/app-cms/util/access';
import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { CollectionConfig } from 'payload';

import { restrictToTenantInTenantMode } from './access/restrict-to-tenant-in-tenant-mode';
import { deploymentField } from './fields/deployment.field';
import { enforceApiKeyHook } from './hooks/enforce-api-key.hook';
import { generateApiKeyHook } from './hooks/generate-api-key.hook';
import { populateIconHook } from './hooks/populate-icon.hook';

/**
 * Tenants collection
 */
const tenants: CollectionConfig = {
  slug: 'tenants',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true
  },
  access: {
    create: systemUserAccess,
    delete: systemUserAccess,
    read: restrictToTenantInTenantMode,
    update: systemUserAccess
  },
  hooks: {
    afterRead: [populateIconHook],
    beforeOperation: [generateApiKeyHook],
    beforeValidate: [normalizeDomains],
    beforeChange: [enforceApiKeyHook, guardDomainConflicts]
  },
  admin: {
    group: adminGroups.settings,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'description', 'supportedLocales'],
    description: {
      en: 'A workspace is like an organization or group of users and is often called a "tenant". You must be a member to see its content.',
      sv: 'En arbetsyta är som en organisation eller grupp av användare och kallas ofta för en "tenant". Man måste vara medlem för att kunna se innehållet.'
    },
    // Hide from regular users
    hidden: ({ user }) => hasNoAdminRoles(user)
  },
  labels: {
    singular: { en: 'Workspace', sv: 'Arbetsyta' },
    plural: { en: 'Workspaces', sv: 'Arbetsytor' }
  },
  fields: [
    {
      name: 'iconConfig',
      type: 'json',
      virtual: true, // Populated by populateIconHook
      label: { en: 'Icon', sv: 'Ikon' },
      admin: {
        disableListFilter: true,
        disableListColumn: true,
        hidden: true
      }
    },
    // Customize the API key fields to be protected from being updated
    {
      name: 'enableAPIKey',
      type: 'checkbox',
      access: {
        update: () => false
      }
    },
    {
      name: 'apiKey',
      type: 'text',
      access: {
        update: () => false
      },
      admin: {
        disableListColumn: true
      }
    },
    {
      name: 'name',
      type: 'text',
      label: { en: 'Name', sv: 'Namn' },
      required: true,
      admin: {
        components: {
          Cell: '@codeware/apps/cms/components/TenantIconNameCell'
        }
      }
    },
    {
      name: 'description',
      type: 'textarea',
      label: { en: 'Description', sv: 'Beskrivning' }
    },
    {
      name: 'supportedLocales',
      type: 'select',
      label: { en: 'Supported locales', sv: 'Språk som stöds' },
      admin: {
        description: {
          en: 'Select the locales your web client should support. Multiple locales will enable the language selector in the admin UI.',
          sv: 'Välj de språk som din webbklient ska stödja. Vid flera språk aktiveras språkvalet i administrationsgränssnittet.'
        }
      },
      enumName: enumName('tenant_supported_locales'),
      options: [
        { label: { en: 'English', sv: 'Engelska' }, value: 'en' },
        { label: { en: 'Swedish', sv: 'Svenska' }, value: 'sv' }
      ],
      hasMany: true,
      required: true
    },
    deploymentField,
    {
      name: 'infisicalPanel',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@codeware/apps/cms/components/admin/provisioning/InfisicalField'
        }
      }
    },
    domainsField(),
    {
      name: 'domainsPanel',
      type: 'ui',
      admin: {
        components: {
          Field: '@codeware/apps/cms/components/admin/domains/DomainsField'
        }
      }
    },
    {
      type: 'group',
      name: 'relations',
      virtual: true,
      label: { en: 'Related Documents', sv: 'Relaterade dokument' },
      fields: [
        {
          name: 'relatedUsers',
          label: { en: 'Users', sv: 'Användare' },
          type: 'join',
          collection: 'users',
          on: 'tenants.tenant',
          admin: { allowCreate: false, disableListColumn: true }
        },
        {
          name: 'relatedPages',
          label: { en: 'Pages', sv: 'Sidor' },
          type: 'join',
          collection: 'pages',
          on: 'tenant',
          admin: { allowCreate: false, disableListColumn: true }
        },
        {
          name: 'relatedPosts',
          label: { en: 'Posts', sv: 'Inlägg' },
          type: 'join',
          collection: 'posts',
          on: 'tenant',
          admin: { allowCreate: false, disableListColumn: true }
        },
        {
          name: 'relatedCategories',
          label: { en: 'Categories', sv: 'Kategorier' },
          type: 'join',
          collection: 'categories',
          on: 'tenant',
          admin: { allowCreate: false, disableListColumn: true }
        },
        {
          name: 'relatedMedia',
          label: { en: 'Media', sv: 'Media' },
          type: 'join',
          collection: 'media',
          on: 'tenant',
          admin: { allowCreate: false, disableListColumn: true }
        }
      ]
    },
    slugField({ sourceField: 'name' })
  ]
};

export default tenants;
