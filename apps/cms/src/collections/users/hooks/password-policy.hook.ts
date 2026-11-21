import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { type CollectionBeforeOperationHook, ValidationError } from 'payload';

import { isBreachedPassword } from '../utils/is-breached-password';

/** The operations that set a password from what someone typed */
const SETS_PASSWORD = new Set(['create', 'update', 'resetPassword']);

/**
 * Refuse a password that is too short, too long, or known from a breach.
 *
 * `beforeOperation`, because it is the one hook a password reset runs with the
 * password still in plain text; by `beforeValidate` it is already hashed. The
 * seed is exempt: its development users sign in with a short shared password
 * on purpose, and production seeds take theirs from the vault.
 */
export const passwordPolicyHook: CollectionBeforeOperationHook<
  'users'
> = async ({ args, operation, req }) => {
  if (!SETS_PASSWORD.has(operation) || req.context?.['seedAction']) {
    return args;
  }

  const password = (args as { data?: { password?: unknown } }).data?.password;

  if (typeof password !== 'string' || !password) {
    return args;
  }

  const t = customT(req.t);
  const refuse = (message: string) => {
    throw new ValidationError({
      collection: 'users',
      errors: [{ path: 'password', message }],
      req
    });
  };

  if (password.length < PASSWORD_MIN_LENGTH) {
    refuse(
      t('authentication:passwordTooShort', { count: PASSWORD_MIN_LENGTH })
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    refuse(t('authentication:passwordTooLong', { count: PASSWORD_MAX_LENGTH }));
  }

  if (await isBreachedPassword(password)) {
    refuse(t('authentication:passwordBreached'));
  }

  return args;
};
