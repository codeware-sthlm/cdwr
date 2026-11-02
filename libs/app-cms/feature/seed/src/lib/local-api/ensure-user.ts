import type { User } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type UserData = Pick<
  User,
  'description' | 'email' | 'name' | 'password' | 'role' | 'tenants'
>;

/**
 * Ensure that a user exist with the given email.
 *
 * @param payload - Payload instance
 * @param data - User data
 * @param options - Seed options; `resetPassword` also writes the password to an existing user
 * @returns The user ID if exists or created, otherwise undefined
 */
export async function ensureUser(
  payload: Payload,
  data: UserData,
  options: {
    locale: TypedLocale;
    /** Write the password to an existing user too */
    resetPassword?: boolean;
    transactionID: string | number | undefined;
  }
): Promise<User | number> {
  const { locale, resetPassword, transactionID } = options;
  const { description, email, name, password, role, tenants } = data;

  // Check if the user exists with the given email
  const users = await payload.find({
    collection: 'users',
    where: {
      email: { equals: email }
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (users.totalDocs) {
    const { id } = users.docs[0];
    if (resetPassword) {
      await payload.update({
        collection: 'users',
        id,
        data: { password },
        context: { seedAction: true },
        req: { transactionID }
      });
    }
    return id;
  }

  // No user found, create one

  const user = await payload.create({
    collection: 'users',
    data: {
      description,
      email,
      name,
      password,
      role,
      tenants
    },
    locale,
    // Provide context to ensureTenantHook to allow empty tenants array
    context: { seedAction: true },
    req: { transactionID }
  });

  return user;
}
