import { isSecondFactorPending } from '@codeware/app-cms/util/access';
import type { Access, Plugin, Where } from 'payload';
import { payloadTotp, totpAccess } from 'payload-totp';

import { totpEnrolmentPlugin } from './totp-enrolment.plugin';
import { totpOptions } from './totp-options';

/**
 * Upload collections whose files visitors load without a user: images on
 * the site, in headless and through the Next image optimizer.
 */
export const publicFileCollections: ReadonlyArray<string> = [
  'media',
  'stock-media'
];

/**
 * `payload-totp` refuses every request without a user, which would stop the
 * file reads above. Only those skip its wrapper: a static file read by a
 * visitor keeps the collection's own access, every other read is wrapped by
 * hand as the plugin would.
 *
 * A session that still owes its code reads files as a visitor too, so a
 * member on the code step still sees the site's images, and nothing more:
 * the collection's access runs without the user, rather than as them.
 */
export const publicFileAccess =
  (inner: Access | undefined): Access =>
  (args) => {
    const { user } = args.req;
    if (!args.isReadingStaticFile || (user && !isSecondFactorPending(user))) {
      return totpAccess(inner)(args);
    }
    if (!inner) {
      return false;
    }
    // A view of the request without its user; everything else, the Payload
    // instance included, comes from the request itself
    const asVisitor = user
      ? Object.create(args.req, { user: { value: null } })
      : args.req;
    return inner({ ...args, req: asVisitor });
  };

const publicFiles: Plugin = (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) =>
    publicFileCollections.includes(collection.slug)
      ? {
          ...collection,
          access: {
            ...collection.access,
            read: publicFileAccess(collection.access?.read)
          },
          custom: {
            ...collection.custom,
            totp: { disableAccessWrapper: { read: true } }
          }
        }
      : collection
  )
});

/** Every document has an id, so this matches none */
const noDocuments: Where = { id: { exists: false } };

/**
 * A session that owes its code finds no tenants instead of being refused.
 * The multi-tenant plugin's tenant selector reads them on every admin view,
 * the code step included, and a refusal there throws and takes the view down.
 */
export const pendingTenantsAccess =
  (inner: Access | undefined): Access =>
  (args) =>
    isSecondFactorPending(args.req.user)
      ? noDocuments
      : totpAccess(inner)(args);

const pendingTenants: Plugin = (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) =>
    collection.slug === 'tenants'
      ? {
          ...collection,
          access: {
            ...collection.access,
            read: pendingTenantsAccess(collection.access?.read)
          },
          custom: {
            ...collection.custom,
            totp: { disableAccessWrapper: { read: true } }
          }
        }
      : collection
  )
});

/**
 * TOTP as a second factor on the `users` login. Enrolment is enforced for
 * system users and workspace admins, optional for everyone else.
 */
export const getTotpPlugins = (): Array<Plugin> => [
  // Before publicFiles, so a visitor's file read skips the enrolment check
  // as well as payload-totp's, while every other read keeps both
  totpEnrolmentPlugin({ collection: 'users' }),
  publicFiles,
  // After the enrolment wrapper too, so a session owing setup finds no
  // tenants rather than being refused
  pendingTenants,
  payloadTotp(totpOptions)
];
