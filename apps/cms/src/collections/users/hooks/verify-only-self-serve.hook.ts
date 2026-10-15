import type { CollectionBeforeOperationHook } from 'payload';

/**
 * Email verification is for self-serve signups only. Every other way a user
 * is created (seed, admin, REST, cdwr) is verified from the start and sends
 * no verification email; a signup marks itself with `context.signup`.
 */
export const verifyOnlySelfServeHook: CollectionBeforeOperationHook<
  'users'
> = ({ args, operation }) => {
  if (operation !== 'create' || args.req.context?.['signup']) {
    return args;
  }

  args.data._verified = true;
  args.disableVerificationEmail = true;

  return args;
};
