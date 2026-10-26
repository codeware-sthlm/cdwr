import {
  isSecondFactorPending,
  isTotpSetupPending,
  mustEnrolTotp
} from '@codeware/app-cms/util/access';
import type { User } from '@codeware/shared/util/payload-types';
import type {
  Access,
  CollectionConfig,
  Endpoint,
  GlobalConfig,
  Payload,
  Plugin
} from 'payload';

const collectionOperations = [
  'create',
  'delete',
  'read',
  'readVersions',
  'unlock',
  'update'
] as const;
const globalOperations = ['read', 'readVersions', 'update'] as const;

/**
 * Holds back a user who must enrol and hasn't: every operation is refused,
 * except reading their own user document, which the setup view needs.
 * Everyone else gets the inner access unchanged, anonymous requests included.
 */
export const enrolmentAccess =
  (inner: Access | undefined, { ownDocument = false } = {}): Access =>
  async (args) => {
    const { user } = args.req;
    if (!isTotpSetupPending(user)) {
      return inner ? inner(args) : Boolean(user);
    }
    if (!ownDocument || !user) {
      return false;
    }
    const result = inner ? await inner(args) : true;
    if (!result) {
      return false;
    }
    const own = { id: { equals: user.id } };
    return result === true ? own : { and: [result, own] };
  };

/**
 * Refuses a custom endpoint to a session that owes the second factor.
 * `payload-totp` covers access control only, and our endpoints check
 * `req.user` themselves, often before running with `overrideAccess`.
 */
export const secondFactorEndpoint = (endpoint: Endpoint): Endpoint => ({
  ...endpoint,
  handler: async (req) =>
    isSecondFactorPending(req.user)
      ? Response.json(
          { errors: [{ message: req.t('error:notAllowedToPerformAction') }] },
          { status: 403 }
        )
      : endpoint.handler(req)
});

const wrapEndpoints = <T extends Array<Endpoint> | false | undefined>(
  endpoints: T
): T => (endpoints ? endpoints.map(secondFactorEndpoint) : endpoints) as T;

function wrapAccess<T extends CollectionConfig | GlobalConfig>(
  entity: T,
  operations: ReadonlyArray<string>,
  ownDocumentRead = false
): T['access'] {
  const access = (entity.access ?? {}) as Record<string, Access | undefined>;
  return {
    ...access,
    ...Object.fromEntries(
      operations.map((operation) => [
        operation,
        enrolmentAccess(access[operation], {
          ownDocument: ownDocumentRead && operation === 'read'
        })
      ])
    )
  } as T['access'];
}

/**
 * Payload appends these after every plugin has run, so they are wrapped once
 * the config is sanitized, as `payload-totp` does with its own wrapper.
 */
function wrapPayloadCollections(payload: Payload) {
  const { config } = payload;
  const operationsBySlug: Record<string, ReadonlyArray<string>> = {
    'payload-jobs': collectionOperations,
    'payload-locked-documents': collectionOperations.filter(
      (operation) => operation !== 'read'
    ),
    'payload-query-presets': collectionOperations
  };
  if (config.folders) {
    operationsBySlug[config.folders.slug] = collectionOperations;
  }
  for (const collection of config.collections) {
    const operations = operationsBySlug[collection.slug];
    if (operations) {
      collection.access = wrapAccess(
        collection as CollectionConfig,
        operations
      ) as typeof collection.access;
    }
  }
  // The schedule stats the host's nightly jobs are planned from
  for (const global of config.globals ?? []) {
    if (global.slug === 'payload-jobs-stats') {
      global.access = wrapAccess(
        global as GlobalConfig,
        globalOperations
      ) as typeof global.access;
    }
  }
}

/**
 * TOTP enrolment for system users and workspace admins only.
 *
 * `payload-totp` enforces enrolment for a whole collection or nobody, so it
 * runs with `forceSetup` off and this plugin, registered right before it,
 * decides who must enrol: it holds such a user back everywhere and sends the
 * admin to the setup view. Custom endpoints are refused to any session that
 * owes a code, which the plugin does not cover.
 */
export const totpEnrolmentPlugin =
  ({ collection }: { collection: string }): Plugin =>
  (config) => ({
    ...config,
    admin: {
      ...config.admin,
      components: {
        ...config.admin?.components,
        providers: [
          ...(config.admin?.components?.providers ?? []),
          '@codeware/apps/cms/components/admin/totp/TotpEnrolmentRedirect#TotpEnrolmentRedirect'
        ]
      }
    },
    collections: (config.collections ?? []).map((entity) => ({
      ...entity,
      access: wrapAccess(
        entity,
        collectionOperations,
        entity.slug === collection
      ),
      endpoints: wrapEndpoints(entity.endpoints),
      fields:
        entity.slug === collection
          ? [
              ...entity.fields,
              {
                name: 'totpRequired',
                type: 'checkbox',
                virtual: true,
                access: {
                  read: ({ data, req: { user } }) =>
                    Boolean(user && data?.id === user.id)
                },
                admin: { hidden: true, disableBulkEdit: true },
                hooks: {
                  afterRead: [({ data }) => mustEnrolTotp(data as User)]
                }
              }
            ]
          : entity.fields
    })),
    endpoints: wrapEndpoints(config.endpoints),
    globals: (config.globals ?? []).map((entity) => ({
      ...entity,
      access: wrapAccess(entity, globalOperations),
      endpoints: wrapEndpoints(entity.endpoints)
    })),
    onInit: async (payload) => {
      wrapPayloadCollections(payload);
      await config.onInit?.(payload);
    }
  });
