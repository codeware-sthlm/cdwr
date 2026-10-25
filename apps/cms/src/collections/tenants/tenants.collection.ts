import {
  domainsField,
  guardDomainConflicts,
  normalizeDomains
} from '@codeware/app-cms/feature/domains';
import { slugField } from '@codeware/app-cms/ui/fields';
import { systemUserAccess } from '@codeware/app-cms/util/access';
import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { CollectionConfig } from 'payload';

import { restrictToTenantInTenantMode } from './access/restrict-to-tenant-in-tenant-mode';
import { deploymentField } from './fields/deployment.field';
import { idleReportedAtField } from './fields/idle-reported-at.field';
import { idleWarnedAtField } from './fields/idle-warned-at.field';
import { statsShareIdField } from './fields/stats-share-id.field';
import { statsTeamIdField } from './fields/stats-team-id.field';
import { statsWebsiteIdField } from './fields/stats-website-id.field';
import { statusField } from './fields/status.field';
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
    // Payload's default is any authenticated identity, tenant api keys included
    unlock: systemUserAccess,
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
    hidden: ({ user }) => hasNoAdminRoles(user),
    components: {
      views: {
        edit: {
          content: {
            Component:
              '@codeware/apps/cms/components/admin/workspace-content/WorkspaceContentView',
            path: '/content',
            // Between Edit (100) and Versions (300)
            tab: {
              label: ({ t }) => customT(t)('workspaceContent:tab'),
              href: '/content',
              order: 200
            }
          }
        }
      }
    }
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
      type: 'tabs',
      tabs: [
        {
          label: { en: 'General', sv: 'Allmänt' },
          fields: [
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
            slugField({ sourceField: 'name', position: undefined }),
            statusField,
            idleWarnedAtField,
            idleReportedAtField
          ]
        },
        {
          label: { en: 'Deployment', sv: 'Driftsättning' },
          fields: [
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
            }
          ]
        },
        {
          label: { en: 'Domains', sv: 'Domäner' },
          fields: [
            domainsField(),
            {
              name: 'domainsPanel',
              type: 'ui',
              admin: {
                components: {
                  Field:
                    '@codeware/apps/cms/components/admin/domains/DomainsField'
                }
              }
            }
          ]
        },
        {
          label: { en: 'Statistics', sv: 'Statistik' },
          fields: [statsWebsiteIdField, statsShareIdField, statsTeamIdField]
        }
      ]
    }
  ]
};

export default tenants;
