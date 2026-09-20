import {
  globalCollectionSlugs,
  tenantCollectionSlugs
} from '@codeware/app-cms/util/definitions';
import {
  editorTenantRoles,
  getUserTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Config } from '@codeware/shared/util/payload-types';
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant';

// Map global collections to the multi-tenant collections config
const globalCollectionsConfig = globalCollectionSlugs.reduce(
  (acc, slug) => {
    acc[slug] = { isGlobal: true };
    return acc;
  },
  {} as Parameters<typeof multiTenantPlugin>['0']['collections']
);

// Every tenant-owned collection takes the plugin's defaults; globals override below
const tenantCollections = tenantCollectionSlugs.reduce(
  (acc, slug) => {
    acc[slug] = {};
    return acc;
  },
  {} as Parameters<typeof multiTenantPlugin>['0']['collections']
);

export const getMultiTenantPlugin = () =>
  multiTenantPlugin<Config>({
    // Default values, but specified for clarity
    cleanupAfterTenantDelete: true,
    debug: false,
    tenantsSlug: 'tenants',
    tenantField: {
      name: 'tenant',
      // Prevent users from assigning content to a tenant they don't belong to.
      // System users are unrestricted.
      // `siblingData.tenant` holds the incoming tenant ID (number) for top-level
      // fields; `value` does not exist in Payload's FieldAccessArgs.
      //
      // Membership alone is not enough: a `reader` belongs to the tenant but may
      // not write to it, so only editor roles count here.
      access: {
        create: ({ req: { user }, siblingData }) => {
          if (!user) return false;
          if (hasRole(user, 'system-user')) return true;
          const userTenantIds = getUserTenantIDs(user, editorTenantRoles);
          return userTenantIds.includes(siblingData?.['tenant'] as number);
        },
        update: ({ req: { user }, siblingData }) => {
          if (!user) return false;
          if (hasRole(user, 'system-user')) return true;
          const userTenantIds = getUserTenantIDs(user, editorTenantRoles);
          return userTenantIds.includes(siblingData?.['tenant'] as number);
        }
      }
    },
    collections: {
      ...tenantCollections,
      ...globalCollectionsConfig
    },
    tenantsArrayField: {
      includeDefaultField: false
    },
    userHasAccessToAllTenants: (user) => hasRole(user, 'system-user')
  });
