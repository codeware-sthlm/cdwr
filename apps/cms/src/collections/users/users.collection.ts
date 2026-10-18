import {
  editorUserAccess,
  systemUserAccess,
  systemUserOrTenantAdminAccess
} from '@codeware/app-cms/util/access';
import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import {
  canEdit,
  getId,
  getUserTenantIDs,
  hasNoAdminRoles,
  hasRole
} from '@codeware/app-cms/util/misc';
import { User } from '@codeware/shared/util/payload-types';
import { CollectionConfig, Condition } from 'payload';

import { adminAccessToAllDocTenants } from './access/admin-access-to-all-doc-tenants';
import { statsAccountField } from './fields/stats-account.field';
import { tenantsArrayField } from './fields/tenants-array.field';
import { forgotPasswordMail } from './forgot-password-email';
import { applyTenantLocaleHook } from './hooks/apply-tenant-locale.hook';
import { ensureTenantHook } from './hooks/ensure-tenant.hook';
import { mailVerificationAfterCreateHook } from './hooks/mail-verification-after-create.hook';
import { validateTenantsArrayAccessHook } from './hooks/validate-tenants-array-access.hook';
import { verifyOnlySelfServeHook } from './hooks/verify-only-self-serve.hook';
import { verifyTenantModeAccessHook } from './hooks/verify-tenant-mode-access.hook';
import { verifyEmailMail } from './verify-email';

/**
 * Condition function to determine whether the Workspaces tab should be shown in the admin UI for a user document.
 */
const showWorkspacesTab: Condition<User> = (data, _, { user }) => {
  // System users editing: always show (for system user documents, hide is handled by role check)
  if (hasRole(user, 'system-user')) {
    // But hide for system-user documents as they don't have tenants
    return data?.role !== 'system-user';
  }

  // If no tenants data yet (new user), show the tab
  if (!data?.tenants?.length) {
    return true;
  }

  // For tenant admins: only show if they are admin of ALL tenants in this user
  const userAdminTenantIds = getUserTenantIDs(user, 'admin');
  const docTenantIds = data.tenants.map((t) => getId(t.tenant)).filter(Boolean);

  // Show tab only if user is admin of all tenants
  return docTenantIds.every((id) => userAdminTenantIds.includes(id));
};

/**
 * Users collection
 */
const users: CollectionConfig<'users'> = {
  slug: 'users',
  auth: {
    maxLoginAttempts: 5,
    lockTime: 1000 * 60 * 60 * 24,
    // Only self-serve signups are left unverified; see verifyOnlySelfServeHook
    verify: {
      generateEmailHTML: ({ req, token, user }) =>
        verifyEmailMail(req.payload, {
          token,
          name: user?.name,
          locale: req.i18n.language === 'sv' ? 'sv' : 'en'
        }).html,
      generateEmailSubject: ({ req, token, user }) =>
        verifyEmailMail(req.payload, {
          token,
          name: user?.name,
          locale: req.i18n.language === 'sv' ? 'sv' : 'en'
        }).subject
    },
    forgotPassword: {
      generateEmailHTML: async ({ req, token, user } = {}) =>
        req && token && user
          ? (await forgotPasswordMail({ req, token, user })).html
          : '',
      generateEmailSubject: async ({ req, token, user } = {}) =>
        req && token && user
          ? (await forgotPasswordMail({ req, token, user })).subject
          : ''
    }
  },
  admin: {
    group: adminGroups.settings,
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'tenants', 'description'],
    description: {
      en: 'Manage users and their access to workspaces.',
      sv: 'Hantera användare och deras åtkomst till arbetsytor.'
    },
    // Hide from regular users
    hidden: ({ user }) => hasNoAdminRoles(user)
  },
  labels: {
    singular: { en: 'User', sv: 'Användare' },
    plural: { en: 'Users', sv: 'Användare' }
  },
  access: {
    // The admin panel is for managing a site, which is a separate thing from
    // reading one. A user whose every membership is `reader` authenticates
    // through the same login but must never reach the panel.
    admin: ({ req: { user } }) => canEdit(user),
    // Read and unlock fall back to "any authenticated identity", which includes
    // tenant api keys — and those the multi-tenant plugin never scopes
    read: editorUserAccess,
    unlock: systemUserOrTenantAdminAccess,
    create: systemUserOrTenantAdminAccess,
    update: adminAccessToAllDocTenants('allowSelf'),
    delete: adminAccessToAllDocTenants('denySelf')
  },
  hooks: {
    beforeOperation: [verifyOnlySelfServeHook],
    beforeValidate: [ensureTenantHook],
    beforeChange: [validateTenantsArrayAccessHook],
    afterChange: [mailVerificationAfterCreateHook],
    afterLogin: [verifyTenantModeAccessHook, applyTenantLocaleHook]
  },
  fields: [
    // Payload's own verification flag, which any signed-in user could set;
    // merged over it so only system users can mark an address confirmed
    {
      name: '_verified',
      type: 'checkbox',
      access: {
        create: systemUserAccess,
        update: systemUserAccess
      }
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Generic', sv: 'Allmänt' },
          fields: [
            {
              name: 'name',
              type: 'text',
              label: { en: 'Name', sv: 'Namn' },
              required: true
            },
            {
              name: 'role',
              type: 'select',
              label: { en: 'Role', sv: 'Roll' },
              access: {
                // For others than system users the field is read-only with default value
                create: systemUserAccess,
                update: systemUserAccess
              },
              enumName: enumName('user_role'),
              options: [
                { label: { en: 'User', sv: 'Användare' }, value: 'user' },
                {
                  label: { en: 'System User', sv: 'Systemanvändare' },
                  value: 'system-user'
                }
              ],
              admin: {
                description: {
                  en: 'System users have access to manage the whole system and do not need to be members of a workspace. For normal users, it is a requirement to be members of a workspace.',
                  sv: 'Systemanvändare har behörighet att hantera hela systemet och behöver därför inte vara medlemmar i en arbetsyta. För normala användare är det ett krav att vara medlemmar i en arbetsyta.'
                }
              },
              required: true,
              defaultValue: 'user'
            }
          ]
        },
        {
          label: { en: 'Workspaces', sv: 'Arbetsytor' },
          fields: [tenantsArrayField()],
          admin: {
            condition: showWorkspacesTab
          }
        }
      ]
    },
    {
      name: 'description',
      type: 'textarea',
      label: { en: 'Description', sv: 'Beskrivning' },
      admin: {
        description: {
          en: 'Short description of the user.',
          sv: 'Kort beskrivning av användaren.'
        },
        position: 'sidebar'
      },
      maxLength: 200
    },
    statsAccountField()
  ]
};

export default users;
