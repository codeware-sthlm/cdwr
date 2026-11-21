import { hasRole } from '@codeware/app-cms/util/misc';
import type { CollectionBeforeOperationHook } from 'payload';

/**
 * Only the platform's own creates skip email verification: a system user,
 * the seed, and server code running without a user. Everyone else — a tenant
 * admin adding a user, or a self-serve signup — gets an unverified account
 * that has to confirm its address before it can sign in.
 */
export const verifyOnlySelfServeHook: CollectionBeforeOperationHook<
  'users'
> = ({ args, operation }) => {
  if (operation !== 'create') {
    return args;
  }

  const { context, user } = args.req;
  const trusted =
    Boolean(context?.['seedAction']) ||
    hasRole(user ?? null, 'system-user') ||
    (!user && !context?.['signup']);

  if (trusted) {
    args.data._verified = true;
  } else if (!context?.['signup']) {
    // Payload would send this inside the create, where a failed delivery
    // undoes the whole create; mailVerificationAfterCreateHook sends it
    // without holding the create back
    context['mailVerification'] = true;
  }
  // A signup mails its own once its transaction has committed
  args.disableVerificationEmail = true;

  return args;
};
