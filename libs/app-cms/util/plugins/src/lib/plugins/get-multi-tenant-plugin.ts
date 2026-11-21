import {
  globalCollectionSlugs,
  tenantCollectionSlugs
} from '@codeware/app-cms/util/definitions';
import {
  editorTenantRoles,
  getId,
  getUserTenantIDs,
  hasRole,
  isAgent,
  isTenant
} from '@codeware/app-cms/util/misc';
import type { Config, Tenant } from '@codeware/shared/util/payload-types';
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
      // The plugin defaults to the sidebar; collections keep every field in
      // the main form
      admin: { position: undefined },
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
          // An agent writes to its own workspace only
          if (isAgent(user)) {
            return getId<Tenant>(user.tenant) === siblingData?.['tenant'];
          }
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
    // A tenant api key carries no tenants array, so since 3.90 the plugin's
    // membership check refuses the tenant `ensureTenantFromApiKey` stamps on
    // public writes. Counting the key here only lifts that check: the plugin's
    // access wrapper applies to `users` alone, and its filters already leave a
    // user without assigned tenants unfiltered. The tenant field's create
    // access above still keeps a key from choosing the value itself.
    //
    // An agent counts the same way, for the workspace `agentDraftOnly` stamps
    // on its drafts; the posts access does its scoping.
    userHasAccessToAllTenants: (user) =>
      hasRole(user, 'system-user') || isTenant(user) || isAgent(user)
  });
