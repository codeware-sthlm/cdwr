import { systemUserAccess } from '@codeware/app-cms/util/access';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { CollectionConfig } from 'payload';

/**
 * Agents collection
 *
 * An api key identity for an automated writer, such as the devlog agent. It
 * belongs to one workspace and holds no membership, so every user-only write
 * refuses it; the collections that grant it anything do so by name (posts).
 *
 * There is no password and no admin login. A key is rotated by creating a new
 * agent, as for workspaces.
 */
const agents: CollectionConfig = {
  slug: 'agents',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true
  },
  access: {
    admin: () => false,
    create: systemUserAccess,
    delete: systemUserAccess,
    read: systemUserAccess,
    unlock: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    group: adminGroups.settings,
    useAsTitle: 'name',
    defaultColumns: ['name', 'tenant', 'updatedAt'],
    description: {
      en: 'Agents draft content through an API key. They can never publish.',
      sv: 'Agenter skriver utkast via en API-nyckel. De kan aldrig publicera.'
    },
    hidden: ({ user }) => hasNoAdminRoles(user)
  },
  labels: {
    singular: { en: 'Agent', sv: 'Agent' },
    plural: { en: 'Agents', sv: 'Agenter' }
  },
  fields: [
    // The api key can't be changed afterwards, as for workspaces
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
      required: true
    },
    {
      // A plain relationship, not the multi-tenant plugin's field: the agent
      // is not content of the workspace, and only a system user manages it
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      label: { en: 'Workspace', sv: 'Arbetsyta' },
      required: true,
      access: {
        update: () => false
      },
      admin: {
        description: {
          en: 'The only workspace the agent can draft in.',
          sv: 'Den enda arbetsyta som agenten kan skriva utkast i.'
        }
      }
    }
  ]
};

export default agents;
